const hasChinese = (text: string) => /[\u3400-\u9fff]/.test(text)

export const toUserMessage = (value: unknown, fallback: string) => {
  const message =
    typeof value === 'string'
      ? value.trim()
      : value instanceof Error
        ? value.message.trim()
        : ''

  if (!message || message === '[object Object]') {
    return fallback
  }

  if (!hasChinese(message)) {
    return fallback
  }

  return message
}
