import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Sidebar />
      <div className="flex min-h-dvh flex-col lg:pl-60">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-6">
          {children}
        </main>
      </div>
    </>
  );
}
