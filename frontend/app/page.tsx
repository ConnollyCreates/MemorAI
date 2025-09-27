import Header from "../components/navbar";

export default function Home() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="p-8">
        <h1 className="text-4xl font-bold">Welcome to MemorAI</h1>
        <p className="mt-4 text-lg">Your application is ready!</p>
      </main>
    </div>
  );
}
