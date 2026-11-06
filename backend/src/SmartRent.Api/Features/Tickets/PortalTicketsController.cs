using Microsoft.AspNetCore.Mvc;
using SmartRent.Api.Features.Auth;

namespace SmartRent.Api.Features.Tickets;

// API khách chỉ cho xem/ghi ticket thuộc mình. Repository kiểm tra ownership ngay trong SQL.
[ApiController]
[Route("api/v1/portal/tickets")]
public sealed class PortalTicketsController(AuthSessionService sessions,TicketRepository repository)
    : TicketApiController(sessions)
{
    [HttpGet]
    public Task<IActionResult> List([FromQuery] TicketListQuery query,CancellationToken ct) =>
        RunAsync("user",async actor=>await repository.ListAsync(actor,query,ct),ct);

    [HttpGet("{id:guid}")]
    public Task<IActionResult> Get(Guid id,CancellationToken ct) =>
        RunAsync("user",async actor=>await repository.GetAsync(actor,id,ct),ct);

    [HttpPost]
    public Task<IActionResult> Create(CreateTicketRequest body,CancellationToken ct) =>
        RunAsync("user",async actor=>await repository.CreateAsync(actor,body,
            Request.Headers["Idempotency-Key"].FirstOrDefault(),ct),ct);

    [HttpPost("{id:guid}/messages")]
    public Task<IActionResult> Message(Guid id,TicketMessageRequest body,CancellationToken ct) =>
        RunAsync("user",async actor=>await repository.MessageAsync(actor,id,body,ct),ct);

    // Khách không truyền status tự do: nút xác nhận chỉ chuyển resolved -> closed.
    [HttpPost("{id:guid}/confirm")]
    public Task<IActionResult> Confirm(Guid id,CancellationToken ct) =>
        RunAsync("user",async actor=>await repository.TransitionAsync(actor,id,
            new("close",Reason:"Khách xác nhận đã xử lý xong.",ExpectedStatus:"resolved"),ct),ct);

    [HttpPost("{id:guid}/reopen")]
    public Task<IActionResult> Reopen(Guid id,TicketReopenRequest body,CancellationToken ct) =>
        RunAsync("user",async actor=>await repository.TransitionAsync(actor,id,new("reopen",body.Reason),ct),ct);
}
