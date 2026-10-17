#include <omp.h>

int webroms_set_threads(int count) {
  if (count != 1 && count != 2 && count != 4) return -1;
  omp_set_dynamic(0);
  omp_set_num_threads(count);
  return 0;
}

int webroms_threads(void) {
  int count = 0;
  #pragma omp parallel reduction(+:count)
  count += 1;
  return count;
}
