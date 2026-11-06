using Npgsql;
using NpgsqlTypes;

namespace SmartRent.Api.Features.Dashboard;

// Repository chịu trách nhiệm truy vấn PostgreSQL; controller không cần tự viết SQL.
public sealed class DashboardRepository
{
    // Data source được Program.cs đăng ký dùng chung và quản lý các kết nối đến PostgreSQL.
    private readonly NpgsqlDataSource _dataSource;

    public DashboardRepository(NpgsqlDataSource dataSource)
    {
        _dataSource = dataSource;
    }

    // Dữ liệu của toàn trang /admin được tổng hợp từ các bảng thật, cùng bộ lọc tháng/cơ sở.
    public Task<string> GetDashboardAsync(DateOnly monthStart, Guid? propertyId,
        CancellationToken cancellationToken) =>
        DashboardOverviewQuery.ExecuteAsync(_dataSource, monthStart, propertyId, cancellationToken);

    // propertyId = null: thống kê tất cả cơ sở; có giá trị: chỉ tính phòng của cơ sở đó.
    // CancellationToken giúp ngừng chờ database khi request bị hủy.
    public async Task<RoomStatsDto> GetRoomStatsAsync(
        Guid? propertyId,
        CancellationToken cancellationToken)
    {
        // View v_room_occupancy tổng hợp trạng thái phòng từ phòng, hợp đồng đang hoạt động và giữ chỗ.
        // COUNT(*) FILTER đếm từng trạng thái; truy vấn tổng hợp vẫn trả một dòng 0 khi không có phòng.
        const string sql = """
            SELECT
                COUNT(*) AS total,

                COUNT(*) FILTER (
                    WHERE occupancy_status = 'available'
                ) AS available,

                COUNT(*) FILTER (
                    WHERE occupancy_status = 'occupied'
                ) AS occupied,

                COUNT(*) FILTER (
                    WHERE occupancy_status = 'reserved'
                ) AS reserved,

                COUNT(*) FILTER (
                    WHERE occupancy_status = 'maintenance'
                ) AS maintenance,

                COUNT(*) FILTER (
                    WHERE occupancy_status = 'inactive'
                ) AS inactive

            FROM smartrent.v_room_occupancy

            WHERE @property_id IS NULL
               OR property_id = @property_id;
            """;

        // Mở kết nối bất đồng bộ; await using trả kết nối về pool khi kết thúc, kể cả khi xảy ra lỗi.
        await using var connection =
            await _dataSource.OpenConnectionAsync(cancellationToken);

        await using var command = new NpgsqlCommand(sql, connection);

        // Truyền UUID bằng tham số thay vì ghép vào chuỗi SQL. DBNull.Value biểu diễn NULL trong PostgreSQL.
        command.Parameters.Add(
            "property_id",
            NpgsqlDbType.Uuid
        ).Value = (object?)propertyId ?? DBNull.Value;

        await using var reader =
            await command.ExecuteReaderAsync(cancellationToken);

        // COUNT luôn trả một dòng. Thứ tự GetInt64 bên dưới phải khớp thứ tự các cột SELECT.
        await reader.ReadAsync(cancellationToken);

        return new RoomStatsDto(
            Total: reader.GetInt64(0),
            Available: reader.GetInt64(1),
            Occupied: reader.GetInt64(2),
            Reserved: reader.GetInt64(3),
            Maintenance: reader.GetInt64(4),
            Inactive: reader.GetInt64(5)
        );
    }
}
