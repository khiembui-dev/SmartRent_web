using Microsoft.AspNetCore.Mvc;

namespace SmartRent.Api.Features.Auth;

// Đăng nhập, đăng ký, tài khoản. Người 1 phụ trách.
// Danh sách API cần viết: backend/HUONG_DAN_THEO_TRANG.md.
[ApiController]
[Route("api/v1/me")]
public sealed class MeController : ControllerBase
{
}
