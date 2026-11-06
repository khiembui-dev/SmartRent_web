using System.Net;

namespace SmartRent.Api.Common.Errors;

public class AppException : Exception
{
    public HttpStatusCode StatusCode { get; }
    public string? ErrorCode { get; }

    public AppException(string message, HttpStatusCode statusCode = HttpStatusCode.BadRequest, string? errorCode = null)
        : base(message)
    {
        StatusCode = statusCode;
        ErrorCode = errorCode;
    }
}

public class NotFoundException : AppException
{
    public NotFoundException(string message = "Không tìm thấy dữ liệu yêu cầu.")
        : base(message, HttpStatusCode.NotFound, "not_found")
    {
    }
}

public class BadRequestException : AppException
{
    public BadRequestException(string message)
        : base(message, HttpStatusCode.BadRequest, "bad_request")
    {
    }
}

public class UnauthorizedException : AppException
{
    public UnauthorizedException(string message = "Email hoặc mật khẩu chưa đúng.")
        : base(message, HttpStatusCode.Unauthorized, "invalid_credentials")
    {
    }
}

public class ForbiddenException : AppException
{
    public ForbiddenException(string message = "Bạn không có quyền thực hiện thao tác này.")
        : base(message, HttpStatusCode.Forbidden, "forbidden")
    {
    }
}

public class ConflictException : AppException
{
    public ConflictException(string message)
        : base(message, HttpStatusCode.Conflict, "conflict")
    {
    }
}

public class ValidationException : AppException
{
    public IDictionary<string, string[]> Errors { get; }

    public ValidationException(string message, IDictionary<string, string[]>? errors = null)
        : base(message, (HttpStatusCode)422, "validation_failed")
    {
        Errors = errors ?? new Dictionary<string, string[]>();
    }
}
