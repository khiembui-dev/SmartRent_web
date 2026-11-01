using Microsoft.AspNetCore.Mvc;

namespace SmartRent.Api.Features.Contracts;

// Hợp đồng, nhận phòng, trả phòng. Người 3 phụ trách.
// Danh sách API cần viết: backend/HUONG_DAN_THEO_TRANG.md.
[ApiController]
[Route("api/v1/tenancies")]
public sealed class TenanciesController : ControllerBase
{
}
