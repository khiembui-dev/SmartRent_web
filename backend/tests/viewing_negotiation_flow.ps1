[CmdletBinding()]
param([string]$BaseUrl='http://127.0.0.1:5174')
$ErrorActionPreference='Stop'
function Post($path,$body,$headers) { Invoke-RestMethod "$BaseUrl$path" -Method Post -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 8) -Headers $headers }
function Login($email) { $r=Post '/api/v1/auth/login' @{ email=$email; password='SmartRentDemo!2026' } @{}; return @{ Authorization='Bearer '+$r.accessToken } }
function Reject($path,$body,$headers,$expected) {
    try { $null=Post $path $body $headers; throw "Expected HTTP $expected at $path" }
    catch { if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne $expected) { throw }; Write-Host "PASS rejected $expected $path" }
}
function Check($condition,$message) { if (-not $condition) { throw $message }; Write-Host "PASS $message" }
$admin=Login 'admin@example.test'; $customer=Login 'demo.tenant01@example.test'; $other=Login 'demo.tenant02@example.test'
$day=[DateTimeOffset]::UtcNow.ToOffset([TimeSpan]::FromHours(7)).AddDays(1).ToString('yyyy-MM-dd')
$q=$null
try {
    Reject '/api/v1/portal/inquiries' @{ slug='demo26-4-101'; occupants=10; preferredViewingAt="${day}T20:00:00+07:00" } $customer 422
    Reject '/api/v1/portal/inquiries' @{ slug='demo26-4-101'; occupants=2; preferredViewingAt="${day}T20:01:00+07:00" } $customer 422
    $q=Post '/api/v1/portal/inquiries' @{ slug='demo26-4-101'; occupants=2; preferredViewingAt="${day}T20:00:00+07:00"; message='Local negotiation integration test' } $customer
    $a="/api/v1/inquiries/$($q.id)/decision"; $u="/api/v1/portal/inquiries/$($q.id)/decision"
    Reject $u @{ action='accept' } $other 404
    Reject $u @{ action='accept' } $customer 409
    $q=Post $a @{ action='accept' } $admin
    Check ($q.status -eq 'scheduled') 'Admin accepts exactly the requested 20:00 start'
    $original=$q.scheduledAt
    Reject $a @{ action='accept' } $admin 409
    Reject "/api/v1/inquiries/$($q.id)/viewings" @{ startsAt="${day}T18:00:00+07:00"; endsAt="${day}T18:30:00+07:00" } $admin 409
    Reject "/api/v1/inquiries/$($q.id)/viewings" @{ startsAt="${day}T18:00:00+07:00"; endsAt="${day}T18:30:00+07:00" } $customer 403
    Reject "/api/v1/inquiries/$($q.id)/viewings" @{ startsAt="${day}T18:00:00+07:00"; endsAt="${day}T18:30:00+07:00" } @{} 401
    Reject $a @{ action='propose'; startsAt="${day}T20:00:00+07:00"; endsAt="${day}T21:01:00+07:00"; reason='Over closing time' } $admin 422
    Reject $a @{ action='propose'; startsAt="${day}T19:00:00+07:00" } $admin 422
    $q=Post $a @{ action='propose'; startsAt="${day}T20:00:00+07:00"; endsAt="${day}T21:00:00+07:00"; reason='Allow a full hour to view' } $admin
    Check ($q.scheduledAt -eq $original) 'Confirmed appointment remains effective while negotiating'
    $oldProposal=$q.proposal.id
    Reject $a @{ action='accept'; proposalId=$oldProposal } $admin 409
    $q=Post $u @{ action='propose'; proposalId=$oldProposal; startsAt="${day}T18:00:00+07:00"; endsAt="${day}T18:30:00+07:00"; reason='Customer requests an earlier time' } $customer
    Check ($q.proposal.byRole -eq 'user' -and $q.scheduledAt -eq $original) 'Customer counterproposal does not overwrite confirmed appointment'
    Reject $a @{ action='accept'; proposalId=$oldProposal } $admin 409
    $q=Post $a @{ action='accept'; proposalId=$q.proposal.id } $admin
    Check (-not $q.proposal -and $q.negotiationHistory.Count -eq 4) 'Admin accepts latest counterproposal and history is preserved'
    $appointment=$q.nextViewing.id
    Reject "/api/v1/viewings/$appointment/result" @{ status='completed' } $admin 422
    Reject "/api/v1/viewings/$appointment/result" @{ status='no_show' } $admin 422
    Reject $a @{ action='reject'; reason='Cannot reject an already confirmed appointment' } $admin 409
    Reject $u @{ action='cancel' } $customer 422
    $q=Post $u @{ action='cancel'; reason='Integration test complete' } $customer
    Check ($q.status -eq 'cancelled' -and -not $q.nextViewing) 'Customer cancellation closes appointment and request'
    Reject $a @{ action='accept' } $admin 409
    # A separate initial request tests customer consent to an admin proposal and rejection reasons.
    $q=Post '/api/v1/portal/inquiries' @{ slug='demo26-4-101'; occupants=2; preferredViewingAt="${day}T20:00:00+07:00" } $customer
    $a="/api/v1/inquiries/$($q.id)/decision"; $u="/api/v1/portal/inquiries/$($q.id)/decision"
    $q=Post $a @{ action='propose'; startsAt="${day}T19:00:00+07:00"; endsAt="${day}T19:30:00+07:00"; reason='Suggest an earlier viewing' } $admin
    $q=Post $u @{ action='accept'; proposalId=$q.proposal.id } $customer
    Check ($q.status -eq 'scheduled') 'Customer can accept admin proposal'
    $q=Post $u @{ action='cancel'; reason='Finish consent test' } $customer
    $q=Post '/api/v1/portal/inquiries' @{ slug='demo26-4-101'; occupants=2; preferredViewingAt="${day}T20:00:00+07:00" } $customer
    $a="/api/v1/inquiries/$($q.id)/decision"
    Reject $a @{ action='reject' } $admin 422
    $q=Post $a @{ action='reject'; reason='No host available at requested time' } $admin
    Check ($q.status -eq 'rejected' -and $q.decisionNotes) 'Admin rejects initial request with reason'
} finally {
    if ($q -and $q.status -notin @('cancelled','rejected')) {
        $null=Post "/api/v1/inquiries/$($q.id)/decision" @{ action='cancel'; reason='Clean up local integration test' } $admin
    }
    foreach($headers in @($admin,$customer,$other)) { $null=Post '/api/v1/auth/logout' @{} $headers }
}
