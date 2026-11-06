using Microsoft.AspNetCore.Mvc;
using SmartRent.Api.Features.Auth;
using SmartRent.Api.Features.Tickets;

namespace SmartRent.Api.Features.Catalog;

// Danh mục dùng chung, phần khách thuê. Người 2 phụ trách.
// Danh sách API cần viết: backend/HUONG_DAN_THEO_TRANG.md.
[ApiController]
[Route("api/v1/portal/catalog")]
public sealed class PortalCatalogController(AuthSessionService sessions,TicketRepository tickets)
    : TicketApiController(sessions)
{
    // Bốn loại sự cố lấy từ enum nghiệp vụ khớp CHECK(category_code), không có bảng danh mục phụ.
    [HttpGet]
    public Task<IActionResult> Get(CancellationToken ct) =>
        RunAsync("user",async _=>await tickets.CatalogAsync(false,ct),ct);
}
