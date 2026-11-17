import { notFound } from "tradjs/server";

export default function MissingPage() {
  // Intentional: this route exists but its resource does not.
  notFound();
}
