"use client";

export default function LogoutButton() {
  function handleSubmit() {
    // Clear the client-side cache before the form navigates away.
    localStorage.removeItem("spocity_user");
  }

  return (
    <form action="/api/auth/logout" method="post" onSubmit={handleSubmit}>
      <button
        type="submit"
        className="text-sm text-zinc-500 hover:text-white transition-colors underline underline-offset-4"
      >
        Log out
      </button>
    </form>
  );
}
