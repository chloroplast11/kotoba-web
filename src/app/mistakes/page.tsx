import Masthead from "@/components/layout/Masthead";
import MistakesClient from "@/components/mistakes/MistakesClient";

export const dynamic = "force-dynamic";

export default function MistakesPage() {
  return (
    <div className="app">
      <Masthead />
      <MistakesClient />
    </div>
  );
}
