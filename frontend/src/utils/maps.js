export function mapUrlError(value, embed = false) {
  if (!value) return null;
  try {
    const u = new URL(value);
    const google = ['google.com', 'www.google.com', 'maps.google.com'].includes(u.hostname);
    const valid = embed ? google && u.pathname.startsWith('/maps/embed') :
      (google && (u.hostname === 'maps.google.com' || u.pathname.startsWith('/maps'))) || u.hostname === 'maps.app.goo.gl' || (u.hostname === 'goo.gl' && u.pathname.startsWith('/maps/'));
    if (u.protocol === 'https:' && !u.username && !u.password && !u.port && value.length <= 4096 && valid) return null;
  } catch { /* Invalid URL is shown as a field error. */ }
  return embed ? 'Dán URL HTTPS Google Maps /maps/embed (chỉ URL src, không dán thẻ iframe).' : 'Dán liên kết HTTPS Google Maps hoặc maps.app.goo.gl hợp lệ.';
}

export function mapLinks(property, address) {
  const supplied = property.mapUrl && !mapUrlError(property.mapUrl) ? property.mapUrl : null;
  const embed = property.mapEmbedUrl && !mapUrlError(property.mapEmbedUrl, true) ? property.mapEmbedUrl : null;
  return {
    url: supplied || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    // Short share links cannot be embedded reliably; never show an unrelated search beside an exact pin.
    embed: embed || (!supplied && address ? `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed` : null),
    searched: !supplied && !embed,
  };
}
