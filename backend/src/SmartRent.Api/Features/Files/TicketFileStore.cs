using System.Security.Cryptography;
using Npgsql;
using SmartRent.Api.Features.Auth;
using SmartRent.Api.Features.Tickets;

namespace SmartRent.Api.Features.Files;

public sealed record TicketFileDto(Guid Id,string FileName,string ContentType,long SizeBytes,
    string Visibility,string ScanStatus);
public sealed record StoredTicketFile(TicketFileDto File,string Path);

// Ảnh Ticket lưu ở App_Data ngoài wwwroot. Không có URL công khai dẫn thẳng tới ổ đĩa.
public sealed class TicketFileStore(NpgsqlDataSource source,IWebHostEnvironment environment)
{
    private readonly string _root=System.IO.Path.Combine(environment.ContentRootPath,"App_Data","ticket-files");

    public async Task<TicketFileDto> SaveAsync(AuthUser actor,IFormFile file,CancellationToken ct)
    {
        if(file.Length is <=0 or >10*1024*1024) throw TicketRules.Invalid("file","Ảnh phải từ 1 byte đến 10 MB.");
        await using var input=file.OpenReadStream();
        using var buffer=new MemoryStream();
        await input.CopyToAsync(buffer,ct);
        var bytes=buffer.ToArray();
        // Chỉ nhận raster JPEG/PNG/WebP, xác định bằng chữ ký tệp; không tin extension/MIME do client gửi.
        // clean ở đây là đã qua kiểm tra định dạng ảnh, không có tuyên bố đã quét antivirus.
        var mime=ImageMime(bytes);
        if(mime is null) throw TicketRules.Invalid("file","Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP hợp lệ.");
        var id=Guid.NewGuid();
        var storageKey=id.ToString("N");
        Directory.CreateDirectory(_root);
        var path=System.IO.Path.Combine(_root,storageKey);
        await System.IO.File.WriteAllBytesAsync(path,bytes,ct);
        var name=System.IO.Path.GetFileName(file.FileName.Replace('\\','/'));
        if(name.Length>150) name=name[..150];
        try
        {
            await using var cmd=source.CreateCommand("""
                INSERT INTO smartrent.files(id,uploaded_by,storage_key,file_name,content_type,byte_size,
                  visibility,purpose,scan_status,sha256)
                VALUES(@id,@actor,@key,@name,@mime,@size,'private','ticket','clean',@hash)
                """);
            cmd.Parameters.AddWithValue("id",id);cmd.Parameters.AddWithValue("actor",actor.Id);
            cmd.Parameters.AddWithValue("key",storageKey);cmd.Parameters.AddWithValue("name",name);
            cmd.Parameters.AddWithValue("mime",mime);cmd.Parameters.AddWithValue("size",(long)bytes.Length);
            cmd.Parameters.AddWithValue("hash",Convert.ToHexString(SHA256.HashData(bytes)));
            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch { System.IO.File.Delete(path);throw; } // Không để file mồ côi khi INSERT thất bại.
        return new(id,name,mime,bytes.Length,"private","clean");
    }

    // Quyền đọc ảnh được kiểm tra cả lúc cấp link và lúc đọc content.
    // Khách không được lấy ảnh của ghi chú nội bộ chỉ bằng cách đoán UUID.
    public async Task<StoredTicketFile> GetAsync(AuthUser actor,Guid id,CancellationToken ct)
    {
        await using var cmd=source.CreateCommand("""
            SELECT f.file_name,f.content_type,f.byte_size,f.storage_key
            FROM smartrent.files f WHERE f.id=@id AND f.purpose='ticket'
              AND f.visibility='private' AND f.scan_status='clean' AND
              (@is_admin OR f.uploaded_by=@actor_id OR EXISTS (
                SELECT 1 FROM smartrent.tickets t WHERE
            """ + TicketSql.Visible + """
                 AND (t.attachment_file_ids @> jsonb_build_array(f.id::text) OR EXISTS (
                   SELECT 1 FROM jsonb_array_elements(t.messages) m
                   WHERE NOT (m->>'isInternal')::boolean
                     AND coalesce(m->'fileIds','[]'::jsonb) @> jsonb_build_array(f.id::text)))))
            """);
        TicketRepository.ActorParameters(cmd,actor);
        cmd.Parameters.AddWithValue("id",id);
        await using var reader=await cmd.ExecuteReaderAsync(ct);
        if(!await reader.ReadAsync(ct)) throw new TicketException(404,"not_found","Không tìm thấy ảnh.");
        var key=reader.GetString(3);
        // Chỉ chấp nhận key UUID do store tạo; metadata cũ không được dùng để thoát khỏi thư mục lưu ảnh.
        if(!Guid.TryParseExact(key,"N",out _)) throw new TicketException(404,"file_missing","Ảnh chưa có trên ổ lưu trữ.");
        var path=System.IO.Path.Combine(_root,key);
        if(!System.IO.File.Exists(path)) throw new TicketException(404,"file_missing","Ảnh chưa có trên ổ lưu trữ.");
        return new(new(id,reader.GetString(0),reader.GetString(1),reader.GetInt64(2),"private","clean"),path);
    }

    public static string? ImageMime(byte[] bytes)
    {
        if(bytes.Length>=8 && bytes.AsSpan(0,8).SequenceEqual(new byte[]{137,80,78,71,13,10,26,10})) return "image/png";
        if(bytes.Length>=3 && bytes[0]==255 && bytes[1]==216 && bytes[2]==255) return "image/jpeg";
        if(bytes.Length>=12 && System.Text.Encoding.ASCII.GetString(bytes,0,4)=="RIFF"
            && System.Text.Encoding.ASCII.GetString(bytes,8,4)=="WEBP") return "image/webp";
        return null;
    }
}
