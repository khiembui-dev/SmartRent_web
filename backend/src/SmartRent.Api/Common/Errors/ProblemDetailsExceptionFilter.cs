using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Npgsql;

namespace SmartRent.Api.Common.Errors;

public class ProblemDetailsExceptionFilter : IExceptionFilter
{
    private readonly IHostEnvironment _env;
    private readonly ILogger<ProblemDetailsExceptionFilter> _logger;

    public ProblemDetailsExceptionFilter(IHostEnvironment env, ILogger<ProblemDetailsExceptionFilter> logger)
    {
        _env = env;
        _logger = logger;
    }

    public void OnException(ExceptionContext context)
    {
        _logger.LogError(context.Exception, "Lỗi xảy ra trong quá trình xử lý yêu cầu: {Message}", context.Exception.Message);

        int status;
        string title;
        string detail;
        string? errorCode = null;

        if (context.Exception is ValidationException valEx)
        {
            status = StatusCodes.Status422UnprocessableEntity;
            title = "Dữ liệu không hợp lệ";
            detail = valEx.Message;
            errorCode = valEx.ErrorCode ?? "validation_failed";
        }
        else if (context.Exception is AppException appEx)
        {
            status = (int)appEx.StatusCode;
            title = appEx.StatusCode.ToString();
            detail = appEx.Message;
            errorCode = appEx.ErrorCode;
        }
        else if (context.Exception is PostgresException pgEx)
        {
            status = pgEx.SqlState switch
            {
                "23505" => StatusCodes.Status409Conflict,
                "23P01" => StatusCodes.Status409Conflict,
                "23503" => StatusCodes.Status400BadRequest,
                "23514" => StatusCodes.Status400BadRequest,
                _ => StatusCodes.Status500InternalServerError
            };
            title = "Database Constraint Error";
            detail = _env.IsDevelopment() ? pgEx.MessageText : "Dữ liệu xung đột hoặc không hợp lệ theo quy định hệ thống.";
            errorCode = pgEx.SqlState;
        }
        else
        {
            status = StatusCodes.Status500InternalServerError;
            title = "Internal Server Error";
            detail = _env.IsDevelopment() ? context.Exception.ToString() : "Đã có lỗi hệ thống xảy ra. Vui lòng thử lại sau.";
        }

        var problemDetails = new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
            Instance = context.HttpContext.Request.Path
        };

        if (!string.IsNullOrEmpty(errorCode))
        {
            problemDetails.Extensions["code"] = errorCode;
        }

        if (context.Exception is ValidationException validationEx && validationEx.Errors.Any())
        {
            problemDetails.Extensions["errors"] = validationEx.Errors;
        }

        context.Result = new ObjectResult(problemDetails)
        {
            StatusCode = status
        };

        context.ExceptionHandled = true;
    }
}
