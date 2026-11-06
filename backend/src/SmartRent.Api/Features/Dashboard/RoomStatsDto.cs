namespace SmartRent.Api.Features.Dashboard;

// DTO là dữ liệu trả về cho bên gọi API; các giá trị COUNT(*) của PostgreSQL dùng kiểu long.
// Reserved được tách riêng ở API thử nghiệm, còn giao diện dashboard chính cần ánh xạ lại trạng thái giữ chỗ.
public sealed record RoomStatsDto(
    long Total,
    long Available,
    long Occupied,
    long Reserved,
    long Maintenance,
    long Inactive
);
