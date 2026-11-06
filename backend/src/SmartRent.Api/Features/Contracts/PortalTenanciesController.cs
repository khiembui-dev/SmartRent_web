using Microsoft.AspNetCore.Mvc;
using SmartRent.Api.Features.Auth;
using SmartRent.Api.Features.Tickets;

namespace SmartRent.Api.Features.Contracts;

// Hợp đồng, nhận phòng, trả phòng, phần khách thuê. Người 3 phụ trách.
// Danh sách API cần viết: backend/HUONG_DAN_THEO_TRANG.md.
[ApiController]
[Route("api/v1/portal/tenancies")]
public sealed class PortalTenanciesController(AuthSessionService sessions,TicketRepository tickets)
    : TicketApiController(sessions)
{
    // TicketNewPage gọi API này để chọn đúng phòng/hợp đồng mà khách đang ở.
    [HttpGet]
    public Task<IActionResult> List(CancellationToken ct) =>
        RunAsync("user",async actor=>await tickets.TenanciesAsync(actor,ct),ct);
}
