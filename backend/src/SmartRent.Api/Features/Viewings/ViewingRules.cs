using SmartRent.Api.Common;

namespace SmartRent.Api.Features.Viewings;

public static class ViewingRules
{
    private static readonly TimeSpan VietnamOffset = TimeSpan.FromHours(7);

    public static void ValidateOccupants(short? occupants, int capacity)
    {
        if (occupants is null || occupants < 1 || occupants > capacity)
            throw new LeaseHttpException(422, "invalid_occupants", $"Số người ở phải từ 1 đến {capacity} người theo sức chứa phòng.");
    }

    public static void ValidateTime(DateTimeOffset? startsAt, DateTimeOffset now, DateTimeOffset? endsAt = null)
    {
        if (startsAt is null || startsAt <= now)
            throw new LeaseHttpException(422, "invalid_preferred_time", "Chọn thời gian xem trong tương lai, từ hôm nay trở đi.");
        var localStart = startsAt.Value.ToOffset(VietnamOffset);
        if (localStart.TimeOfDay > TimeSpan.FromHours(20))
            throw new LeaseHttpException(422, "invalid_preferred_time", "Giờ bắt đầu xem phòng chậm nhất là 20:00 theo giờ Việt Nam.");
        if (endsAt is not null)
        {
            var localEnd = endsAt.Value.ToOffset(VietnamOffset);
            if (endsAt <= startsAt || localEnd.Date != localStart.Date || localEnd.TimeOfDay > TimeSpan.FromHours(21))
                throw new LeaseHttpException(422, "invalid_time", "Lịch xem phải kết thúc sau bắt đầu và chậm nhất lúc 21:00 cùng ngày.");
        }
    }
}
