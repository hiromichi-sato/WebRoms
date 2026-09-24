#include <netcdf.h>
#include <stdio.h>

extern int __real_nc_get_vara_double(int, int, const size_t *, const size_t *, double *);
int __wrap_nc_get_vara_double(int ncid, int varid, const size_t *start, const size_t *count, double *data) {
  int status = __real_nc_get_vara_double(ncid, varid, start, count, data);
  if (status != NC_NOERR) {
    int ndims = 0, dims[NC_MAX_VAR_DIMS];
    char name[NC_MAX_NAME + 1];
    nc_inq_var(ncid, varid, name, NULL, &ndims, dims, NULL);
    fprintf(stderr, "NetCDF %s: %s\n", name, nc_strerror(status));
    for (int i = 0; i < ndims; i++) {
      size_t size = 0;
      nc_inq_dimlen(ncid, dims[i], &size);
      fprintf(stderr, "axis %d size=%zu start=%zu count=%zu\n", i, size, start[i], count[i]);
    }
  }
  return status;
}
