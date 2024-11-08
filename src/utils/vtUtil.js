const formatDate = (timestamp) => {
  if (!timestamp) return 'Unknown';
  return new Date(timestamp * 1000).toISOString().split('T')[0];
};

export const formatVTResult = (data) => {
  const result = [];
  
  // Add basic stats
  result.push(`Last Analysis Stats:`);
  result.push(`- Malicious: ${data.last_analysis_stats?.malicious || 0}`);
  result.push(`- Suspicious: ${data.last_analysis_stats?.suspicious || 0}`);
  result.push(`- Harmless: ${data.last_analysis_stats?.harmless || 0}`);
  result.push(`- Undetected: ${data.last_analysis_stats?.undetected || 0}`);
  
  // Add reputation score if available
  if (data.reputation !== undefined) {
    result.push(`\nReputation Score: ${data.reputation}`);
  }

  // Add current DNS records (A and AAAA records)
  if (data.last_dns_records?.length > 0) {
    const dnsDate = formatDate(data.last_dns_records_date);
    result.push(`\nCurrent DNS Records (as of ${dnsDate}):`);
    data.last_dns_records
      .filter(record => record.type === 'A' || record.type === 'AAAA')
      .forEach(record => {
        result.push(`- ${record.type}: ${record.value} (TTL: ${record.ttl})`);
      });
  }

  // Add historical DNS resolutions
  if (data.resolutions?.length > 0) {
    result.push('\nHistorical DNS Resolutions:');
    data.resolutions.forEach(resolution => {
      const date = formatDate(resolution.attributes?.date);
      const ip = resolution.attributes?.ip_address;
      if (ip && ip !== '0.0.0.0') { // Filter out invalid IPs
        result.push(`- ${ip} (Seen: ${date})`);
      }
    });
  }

  // Add registrar info if available
  if (data.registrar) {
    result.push(`\nRegistrar: ${data.registrar}`);
  }

  // Add creation date if available
  if (data.creation_date) {
    result.push(`Creation Date: ${formatDate(data.creation_date)}`);
  }

  // Add last modification date if available
  if (data.last_modification_date) {
    result.push(`Last Modified: ${formatDate(data.last_modification_date)}`);
  }

  return result.join('\n');
}; 