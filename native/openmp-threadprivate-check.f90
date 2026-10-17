module webroms_tls_check
  implicit none
  integer, save :: marker = 7
  integer, allocatable, save :: values(:)
!$omp threadprivate(marker, values)
contains
  integer(kind=4) function webroms_tls_probe(requested) bind(C)
    integer(kind=4), value :: requested
    integer :: errors
    interface
      integer(kind=4) function omp_get_thread_num() bind(C)
      end function
    end interface
    errors = 0
!$omp parallel num_threads(requested) reduction(+:errors)
    if (marker /= 7) errors = errors + 1
    if (allocated(values)) errors = errors + 1
    allocate(values(3))
    marker = omp_get_thread_num() + 20
    values = marker
!$omp end parallel
!$omp parallel num_threads(requested) reduction(+:errors)
    if (marker /= omp_get_thread_num() + 20) errors = errors + 1
    if (.not. allocated(values)) then
      errors = errors + 1
    else
      if (any(values /= marker)) errors = errors + 1
      deallocate(values)
    end if
    marker = 7
!$omp end parallel
    webroms_tls_probe = errors
  end function
end module
