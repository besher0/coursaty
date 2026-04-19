export class SocialLink {
  private constructor(private readonly value: string) {}

  static create(raw: string): SocialLink {
    if (!raw || typeof raw !== 'string') {
      throw new Error('رابط التواصل مطلوب');
    }

    const normalized = raw.trim();
    let url: URL;

    try {
      url = new URL(normalized);
    } catch {
      throw new Error('رابط التواصل غير صالح');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('رابط التواصل يجب أن يبدأ بـ http أو https');
    }

    return new SocialLink(normalized);
  }

  getValue(): string {
    return this.value;
  }
}

