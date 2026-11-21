import Link from "next/link";

export default function ProjectNotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-xl font-semibold">Không tìm thấy dự án</h1>
      <p className="mt-2 text-sm text-muted">Mã dự án trên đường dẫn không tồn tại, hoặc dự án đã bị xoá.</p>
      <Link href="/" className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
        Về tổng quan
      </Link>
    </div>
  );
}
