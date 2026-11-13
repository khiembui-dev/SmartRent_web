using System.Globalization;
using System.Text;

namespace SmartRent.Api.Common;

/// <summary>Chuẩn hóa từ khóa tiếng Việt; chỉ dùng tìm kiếm, không sửa nội dung lưu SQL.</summary>
public static class SearchText
{
    public static string Fold(string? text) => string.Concat((text ?? "").Normalize(NormalizationForm.FormD)
        .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark))
        .ToLowerInvariant().Replace('đ', 'd').Normalize(NormalizationForm.FormC);
}
