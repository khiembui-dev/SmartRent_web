using Microsoft.AspNetCore.Mvc;

namespace SmartRent.Api.Features.Contracts;

// Hợp đồng, nhận phòng, trả phòng, phần khách thuê. Người 3 phụ trách.
// Danh sách API cần viết: backend/HUONG_DAN_THEO_TRANG.md.
[ApiController]
[Route("api/v1/portal/requests")]
public sealed class PortalRequestsController : ControllerBase
{
}
