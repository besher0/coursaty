export class PhoneNumber {
  private constructor(private readonly value: string) {}

  static create(raw: string): PhoneNumber {
    if (!raw || typeof raw !== 'string') {
      throw new Error('رقم الهاتف مطلوب');
    }

    const normalized = raw.trim();
    const isValid = /^[+]?\d{7,20}$/.test(normalized);

    if (!isValid) {
      throw new Error('رقم الهاتف غير صالح');
    }

    return new PhoneNumber(normalized);
  }

  getValue(): string {
    return this.value;
  }
}

