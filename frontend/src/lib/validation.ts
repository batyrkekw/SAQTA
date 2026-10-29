import type { z } from 'zod';

// Keep validation state in the source language so existing errors also switch locale.
export const validationMessage: z.core.$ZodErrorMap = issue => {
  switch (issue.code) {
    case 'invalid_type': return issue.expected === 'number' || issue.expected === 'int' ? 'Введите корректное число' : 'Заполните поле';
    case 'too_small':
      if (issue.origin === 'string') return `Минимум ${issue.minimum} символов`;
      return issue.inclusive ? `Значение должно быть не меньше ${issue.minimum}` : `Значение должно быть больше ${issue.minimum}`;
    case 'too_big':
      if (issue.origin === 'string') return `Максимум ${issue.maximum} символов`;
      return issue.inclusive ? `Значение должно быть не больше ${issue.maximum}` : `Значение должно быть меньше ${issue.maximum}`;
    case 'invalid_format': return issue.format === 'email' ? 'Введите корректный email' : 'Проверьте формат значения';
    default: return 'Проверьте введённое значение';
  }
};

export function formValidationMessage(form: HTMLFormElement): string | null {
  for (const field of Array.from(form.elements)) {
    if (!(field instanceof HTMLInputElement) || field.disabled || field.readOnly) continue;
    if (field.minLength > 0 && field.value && field.value.length < field.minLength) return `Минимум ${field.minLength} символов`;
    if (field.maxLength > 0 && field.value.length > field.maxLength) return `Максимум ${field.maxLength} символов`;
    if (field.validity.valid) continue;
    if (field.validity.valueMissing) return 'Заполните все обязательные поля';
    if (field.validity.typeMismatch && field.type === 'email') return 'Введите корректный email';
    if (field.validity.tooShort) return `Минимум ${field.minLength} символов`;
    if (field.validity.tooLong) return `Максимум ${field.maxLength} символов`;
    return 'Проверьте введённое значение';
  }
  return null;
}
