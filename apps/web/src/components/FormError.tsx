// The API's error for the whole form, e.g. "Invalid email or password"
export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-700"
    >
      {message}
    </p>
  );
}
