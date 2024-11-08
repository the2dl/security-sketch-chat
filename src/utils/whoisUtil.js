export const parseWhoisData = (whoisData) => {
  if (!whoisData) {
    return {};
  }

  // Extract relevant security-focused fields
  const relevantFields = {
    'Domain Name': whoisData.domainName,
    'Registrar': whoisData.registrar,
    'Name Servers': Array.isArray(whoisData.nameServers) 
      ? whoisData.nameServers.join('\n               ') // Indent continuation lines
      : whoisData.nameServers,
    'Creation Date': whoisData.creationDate,
    'Updated Date': whoisData.updatedDate,
    'Registry Expiry': whoisData.registryExpiryDate,
    'DNSSEC': whoisData.dnssec,
    'Registrant': whoisData.registrantOrganization,
    'Registrant Country': whoisData.registrantCountry,
    'Admin Email': whoisData.adminEmail,
    'Tech Email': whoisData.techEmail,
    'Registry Domain ID': whoisData.registryDomainId
  };

  // Filter out undefined/null values
  return Object.entries(relevantFields)
    .filter(([_, value]) => value !== undefined && value !== null && value !== '')
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
};

export const formatWhoisResult = (parsedData) => {
  if (!parsedData || Object.keys(parsedData).length === 0) {
    return 'No WHOIS data available';
  }

  // Format with proper indentation and line breaks
  return Object.entries(parsedData)
    .map(([key, value]) => `  ${key}: ${value}`)
    .join('\n');
};

export const performWhois = async (domain) => {
  try {
    const response = await fetch(`${process.env.REACT_APP_API_URL}/api/whois/${domain}`);
    if (!response.ok) throw new Error('WHOIS lookup failed');
    
    const data = await response.json();
    const parsedData = parseWhoisData(data);
    return formatWhoisResult(parsedData);
  } catch (error) {
    throw new Error(`WHOIS lookup failed: ${error.message}`);
  }
}; 