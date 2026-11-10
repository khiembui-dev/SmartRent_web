using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
namespace SmartRent.Api.Features.Viewings;

[ApiController, Route("api/v1/viewings")]
public sealed class ViewingsController(NpgsqlDataSource db) : LeasingController(db)
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] DateTimeOffset? from, CancellationToken ct)
    {
        try
        {
            var (c, t, _) = await BeginAsync(true, ct);
            await using (c)
            await using (t)
            {
                var rows = await JsonRowsAsync(c, t, $"select jsonb_build_object('inquiry',{ViewingSql.InquiryJson("b")},'date',to_char((a->>'startsAt')::timestamptz at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD'),'id',a->>'id','inquiryId',b.id,'code',b.code,'status',a->>'status','startsAt',a->>'startsAt','endsAt',a->>'endsAt','resultNotes',a->>'resultNotes','contactName',b.contact_name,'phone',b.phone,'room',jsonb_build_object('id',r.id,'code',r.code)) from bookings b join rooms r on r.id=b.room_id cross join lateral jsonb_array_elements(b.appointments) a where b.kind='viewing' and (@property='' or r.property_id::text=@property) and (@from::timestamptz is null or (a->>'startsAt')::timestamptz>=@from) order by (a->>'startsAt')::timestamptz", ct, P("from", from), P("property", Request.Query["propertyId"].ToString()));
                await t.RollbackAsync(ct);
                return Ok(new
                {
                    items = rows
                });
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
    [HttpPost("{id}/result")]
    public async Task<IActionResult> Result(string id, [FromBody] ViewingResult input, CancellationToken ct)
    {
        try {
            var (c,t,actor) = await BeginAsync(true,ct);
            await using(c) await using(t) {
                var b = await BusinessData.Row(c,t,"select to_jsonb(b)::text from bookings b where kind='viewing' and appointments @> jsonb_build_array(jsonb_build_object('id',@id)) for update",ct,"id",id);
                var appointments=b["appointments"]!.AsArray();
                var appointment=appointments.First(x=>BusinessData.Text(x,"id")==id)!;
                if (BusinessData.Text(appointment,"status")!="scheduled" || BusinessData.Text(b,"status") is "cancelled" or "rejected" or "converted")
                    throw new LeaseHttpException(409,"viewing_closed","Lịch xem đã kết thúc.");
                if (input.Status == "cancelled")
                    await ViewingWorkflow.Apply(c,t,Guid.Parse(BusinessData.Text(b,"id")!),actor,true,new ViewingDecision("cancel",Reason:input.ResultNotes),ct);
                else {
                    if(input.Status is not ("completed" or "no_show")) throw new LeaseHttpException(422,"invalid_status","Kết quả không hợp lệ.");
                    var boundary=DateTimeOffset.Parse(BusinessData.Text(appointment,input.Status=="no_show"?"endsAt":"startsAt")!);
                    if(DateTimeOffset.UtcNow < boundary) throw new LeaseHttpException(422,"too_early","Chưa đến thời điểm ghi kết quả buổi xem.");
                    appointment["status"]=input.Status;
                    appointment["resultNotes"]=input.ResultNotes;
                    appointment["recordedAt"]=DateTimeOffset.UtcNow.ToString("O");
                    await BusinessData.Execute(c,t,"update bookings set status=@status,appointments=@appointments::jsonb,changes=changes-'viewingProposal' where id=@id",ct,
                        "status",input.Status,"appointments",appointments.ToJsonString(),"id",Guid.Parse(BusinessData.Text(b,"id")!));
                    await BusinessData.Execute(c,t,"insert into notifications(recipient_id,event_key,title,body,url) values(@user,@event,'Kết quả xem phòng',@body,'/rooms')",ct,
                        "user",Guid.Parse(BusinessData.Text(b,"user_id")!),"event","viewing-result:"+id,"body",input.Status == "completed" ? "Quản lý đã ghi nhận bạn đến xem phòng." : "Quản lý ghi nhận khách không đến xem phòng.");
                }
                await CommitAsync(t,ct); return Ok(new { id,status=input.Status });
            }
        } catch(LeaseHttpException e) {return LeaseProblem(e);}
          catch(PostgresException e) {return DatabaseProblem(e);}
    }
}
public sealed record ViewingResult(string? Status, string? ResultNotes);
