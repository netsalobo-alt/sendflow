/**
 * Phone number normalization utility for international E.164 compliance
 * with optimized support for Brazilian carrier formats (DDD + 9 digits)
 */
export function normalizePhoneNumber(raw: string, defaultCountryCode = '55'): {
  isValid: boolean;
  e164: string;
  formatted: string;
  reason?: string;
} {
  if (!raw || typeof raw !== 'string') {
    return { isValid: false, e164: '', formatted: '', reason: 'Telefone vazio' };
  }

  // Remove non-digit characters except leading plus
  let cleaned = raw.trim();
  const hasPlus = cleaned.startsWith('+');
  cleaned = cleaned.replace(/\D/g, '');

  if (!cleaned) {
    return { isValid: false, e164: '', formatted: '', reason: 'Nenhum dígito encontrado' };
  }

  // Handle leading zero (e.g. 091991234567 -> 91991234567)
  if (cleaned.startsWith('0') && cleaned.length >= 11) {
    cleaned = cleaned.substring(1);
  }

  let finalNumber = cleaned;

  if (hasPlus) {
    finalNumber = cleaned;
  } else if (cleaned.startsWith('55') && (cleaned.length === 12 || cleaned.length === 13)) {
    // Already has 55 country code
    finalNumber = cleaned;
  } else if (cleaned.length === 10 || cleaned.length === 11) {
    // Standard Brazilian number with DDD (e.g., 91 99999-9999 or 91 8888-8888)
    finalNumber = defaultCountryCode + cleaned;
  } else if (cleaned.length === 8 || cleaned.length === 9) {
    // Missing DDD
    return {
      isValid: false,
      e164: '',
      formatted: raw,
      reason: 'Falta o código DDD (ex: 91, 11)',
    };
  }

  // International standard minimum length 10, max 15 digits
  if (finalNumber.length < 10 || finalNumber.length > 15) {
    return {
      isValid: false,
      e164: '',
      formatted: raw,
      reason: `Comprimento inválido (${finalNumber.length} dígitos)`,
    };
  }

  const e164 = `+${finalNumber}`;

  // Human friendly formatting for display
  let formatted = e164;
  if (finalNumber.startsWith('55') && finalNumber.length === 13) {
    const ddd = finalNumber.slice(2, 4);
    const part1 = finalNumber.slice(4, 9);
    const part2 = finalNumber.slice(9);
    formatted = `+55 (${ddd}) ${part1}-${part2}`;
  } else if (finalNumber.startsWith('55') && finalNumber.length === 12) {
    const ddd = finalNumber.slice(2, 4);
    const part1 = finalNumber.slice(4, 8);
    const part2 = finalNumber.slice(8);
    formatted = `+55 (${ddd}) ${part1}-${part2}`;
  }

  return {
    isValid: true,
    e164,
    formatted,
  };
}

/**
 * Replace placeholders like {{name}}, {{phone_number}}, {{cidade}} in a message
 */
export function interpolateVariables(
  template: string,
  variables: Record<string, string | number | undefined | null>
): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, key) => {
    const normalizedKey = key.toLowerCase();
    // Search case-insensitively
    for (const [k, v] of Object.entries(variables)) {
      if (k.toLowerCase() === normalizedKey && v !== undefined && v !== null) {
        return String(v);
      }
    }
    return match; // keep original placeholder if not found
  });
}
