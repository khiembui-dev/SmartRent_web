using Microsoft.AspNetCore.Mvc;
using SmartRent.Api.Features.Auth;

namespace SmartRent.Api.Features.Tickets;

// Các thao tác của chủ trọ. Mỗi action kiểm tra role admin qua lớp cơ sở trước khi đọc/ghi SQL.
[ApiController]
[Route("api/v1/tickets")]
public sealed class TicketsController(AuthSessionService sessions, TicketRepository repository)
    : TicketApiController(sessions)
{
    [HttpGet]
    public Task<IActionResult> List([FromQuery] TicketListQuery query,CancellationToken ct) =>
        RunAsync("admin",async actor=>await repository.ListAsync(actor,query,ct),ct);

    [HttpGet("{id:guid}")]
    public Task<IActionResult> Get(Guid id,CancellationToken ct) =>
        RunAsync("admin",async actor=>await repository.GetAsync(actor,id,ct),ct);

    // API tạo hỗ trợ admin báo sự cố cho phòng; UI hiện tại chủ yếu tạo từ khu khách.
    [HttpPost]
    public Task<IActionResult> Create(CreateTicketRequest body,CancellationToken ct) =>
        RunAsync("admin",async actor=>await repository.CreateAsync(actor,body,
            Request.Headers["Idempotency-Key"].FirstOrDefault(),ct),ct);

    [HttpPost("{id:guid}/messages")]
    public Task<IActionResult> Message(Guid id,TicketMessageRequest body,CancellationToken ct) =>
        RunAsync("admin",async actor=>await repository.MessageAsync(actor,id,body,ct),ct);

    [HttpPost("{id:guid}/assign")]
    public Task<IActionResult> Assign(Guid id,TicketAssignRequest body,CancellationToken ct) =>
        RunAsync("admin",async actor=>await repository.AssignAsync(actor,id,body,ct),ct);

    [HttpPost("{id:guid}/transitions")]
    public Task<IActionResult> Transition(Guid id,TicketTransitionRequest body,CancellationToken ct) =>
        RunAsync("admin",async actor=>await repository.TransitionAsync(actor,id,body,ct),ct);
}
