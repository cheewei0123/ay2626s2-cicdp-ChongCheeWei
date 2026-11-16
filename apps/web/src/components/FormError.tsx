// The API's error for the whole form, e.g. "Invalid email or password"
export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="whitespace-pre-line rounded-[28px] bg-danger/10 p-4 text-sm text-danger"
    >
      {message}
    </p>
  );
}
