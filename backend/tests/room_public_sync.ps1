[CmdletBinding()]
param([string]$BaseUrl='http://127.0.0.1:5174')
$ErrorActionPreference='Stop'
$headers=@{}; $property=$null; $room=$null
function Call($method,$path,$body=$null) {
    $params=@{ Uri="$BaseUrl$path"; Method=$method; Headers=$headers }
    if($null -ne $body) { $params.Body=$body | ConvertTo-Json -Depth 12; $params.ContentType='application/json' }
    Invoke-RestMethod @params
}
function Check($condition,$message) { if(-not $condition) { throw $message }; Write-Host "PASS $message" }
try {
    $login=Call POST '/api/v1/auth/login' @{ email='admin@example.test'; password='SmartRentDemo!2026' }
    $headers=@{ Authorization='Bearer '+$login.accessToken }
    $catalog=Call GET '/api/v1/catalog'
    $tag='SYNC-'+[Guid]::NewGuid().ToString('N').Substring(0,8)
    $propertyBody=@{ name=$tag; address=@{ line='Test address 101'; locality='Test locality'; province='Test city' }; description='Property description'; mapUrl='https://maps.app.goo.gl/example'; mapEmbedUrl='https://www.google.com/maps/embed?pb=example'; rates=@(@{ chargeTypeId='ELECTRICITY'; unitPrice=3800 },@{ chargeTypeId='WATER'; unitPrice=20000 },@{ chargeTypeId='SERVICE'; unitPrice=150000 }) }
    $property=Call POST '/api/v1/properties' $propertyBody
    $amenity=$catalog.amenities[0].id
    $body=@{ propertyId=$property.id; code='T101'; name='Sync room'; areaM2=28; capacity=2; floorLabel='Floor 2'; rent=4500000; requiredDeposit=9000000; roomTypeId='STUDIO'; roomTypeName='Studio'; description='Room description'; rulesText='Quiet after 22:00'; amenityIds=@($amenity); listing=@{ title='Public title'; description='Public description'; status='published' } }
    $room=Call POST '/api/v1/rooms' $body
    $public=Call GET "/api/v1/public/rooms/$($room.listing.slug)"
    Check ($public.requiredDeposit -eq 9000000 -and $public.rent -eq 4500000) 'Public rent and deposit match room form'
    Check ($public.property.addressLine -eq 'Test address 101' -and $public.mapUrl -eq $propertyBody.mapUrl -and $public.mapEmbedUrl -eq $propertyBody.mapEmbedUrl) 'Public address and Maps match property source'
    Check ($public.rulesText -eq $body.rulesText -and $public.description -eq 'Public description' -and $public.roomType.id -eq 'STUDIO') 'Room type, rules and listing description match'
    Check ($room.amenities[0].id -eq $amenity -and $public.amenities[0].id -eq $amenity) 'Amenities keep stable IDs for edit and public views'
    $propertyBody.address.line='Updated address 202'; $propertyBody.rates[0].unitPrice=4200
    $property=Call PUT "/api/v1/properties/$($property.id)" $propertyBody
    $body.requiredDeposit=0; $body.listing.description=$null; $body.description='Updated fallback description'
    $room=Call PUT "/api/v1/rooms/$($room.id)" $body
    $public=Call GET "/api/v1/public/rooms/$($room.listing.slug)"
    Check ($public.property.addressLine -eq 'Updated address 202' -and ($public.fees | Where-Object code -eq 'ELECTRICITY').unitPrice -eq 4200) 'Property edits propagate to public address and inherited fees'
    Check ($public.requiredDeposit -eq 0 -and $public.description -eq 'Updated fallback description') 'Zero deposit and empty listing description are preserved correctly'
    $body.listing.status='draft'; $room=Call PUT "/api/v1/rooms/$($room.id)" $body
    try { $null=Call GET "/api/v1/public/rooms/$($room.listing.slug)"; throw 'Draft listing was visible' } catch { if(-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 404) { throw } }
    Write-Host 'PASS draft listing stays off public site'
    $propertyBody.mapUrl='https://evil.invalid/maps'
    try { $null=Call PUT "/api/v1/properties/$($property.id)" $propertyBody; throw 'Unsafe Maps URL accepted' } catch { if(-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 422) { throw } }
    Write-Host 'PASS invalid Maps URL rejected'
} finally {
    # Only remove the UUID records created by this test; they have no rental history.
    if($room) { $null=Call DELETE "/api/v1/rooms/$($room.id)" }
    if($property) { $null=Call DELETE "/api/v1/properties/$($property.id)" }
    if($headers.Authorization) { $null=Call POST '/api/v1/auth/logout' @{} }
}
