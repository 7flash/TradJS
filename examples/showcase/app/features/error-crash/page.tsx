/**
 * Error Boundary — this page intentionally throws to demonstrate error.tsx.
 * Visit /features/error-crash to see it in action.
 */
export default function ErrorCrashPage() {
  // Always throw — this page exists solely to trigger the error boundary
  throw new Error(
    "Intentional crash! This page demonstrates the error boundary in action.",
  );
}
