export class SocialLink {
  private constructor(private readonly value: string) {}

  static create(raw: string): SocialLink {
    if (!raw || typeof raw !== 'string') {
      throw new Error('Social link is required');
    }

    const normalized = raw.trim();
    let url: URL;

    try {
      url = new URL(normalized);
    } catch {
      throw new Error('Invalid social link URL');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Social link must be http or https');
    }

    return new SocialLink(normalized);
  }

  getValue(): string {
    return this.value;
  }
}
