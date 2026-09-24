#include <stdint.h>
/* Flang 21 wasm lowers these count arguments as pointer-sized integers;
 * the C++ Fortran runtime declares them as int64_t on every platform. */
extern void _FortranARepeat(void *, const void *, int64_t, const char *, int);
void webromsRepeat(void *result, const void *source, int32_t count, const char *file, int line) {
  _FortranARepeat(result, source, count, file, line);
}
extern void _FortranASpread(void *, const void *, int, int64_t, const char *, int);
void webromsSpread(void *result, const void *source, int dim, int32_t count, const char *file, int line) {
  _FortranASpread(result, source, dim, count, file, line);
}
extern _Bool _FortranAioInquireLogical(void *, uint64_t, _Bool *);
_Bool webromsInquireLogical(void *cookie, uint32_t keyword, _Bool *result) {
  return _FortranAioInquireLogical(cookie, keyword, result);
}
