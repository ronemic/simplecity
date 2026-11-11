type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/** Read every row even when PostgREST caps a requested range below its size. */
export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];

  while (true) {
    const { data, error } = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    rows.push(...data);
  }
}
