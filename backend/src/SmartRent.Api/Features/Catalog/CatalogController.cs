using Microsoft.AspNetCore.Mvc;
using SmartRent.Api.Features.Auth;
using SmartRent.Api.Features.Tickets;

namespace SmartRent.Api.Features.Catalog;

// Danh mục dùng chung. Người 2 phụ trách.
// Danh sách API cần viết: backend/HUONG_DAN_THEO_TRANG.md.
[ApiController]
[Route("api/v1/catalog")]
public sealed class CatalogController(AuthSessionService sessions,TicketRepository tickets)
    : TicketApiController(sessions)
{
    // Phục vụ hộp thoại phân công Ticket; hệ thống hai role chỉ có một admin xử lý.
    [HttpGet]
    public Task<IActionResult> Get(CancellationToken ct) =>
        RunAsync("admin",async _=>await tickets.CatalogAsync(true,ct),ct);
}
