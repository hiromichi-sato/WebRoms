integer(kind=4) function webroms_omp_threads(requested) bind(C)
  implicit none
  integer(kind=4), value :: requested
  integer(kind=4) :: count
  count = 0
!$omp parallel num_threads(requested) reduction(+:count)
  count = count + 1
!$omp end parallel
  webroms_omp_threads = count
end function

integer(kind=4) function webroms_omp_thread_mask(requested) bind(C)
  implicit none
  integer(kind=4), value :: requested
  integer(kind=4) :: mask
  interface
    integer(kind=4) function omp_get_thread_num() bind(C)
    end function
  end interface
  mask = 0
!$omp parallel num_threads(requested) shared(mask)
!$omp critical
  mask = ior(mask, ishft(1, omp_get_thread_num()))
!$omp end critical
!$omp end parallel
  webroms_omp_thread_mask = mask
end function

real(kind=8) function webroms_omp_sum(requested) bind(C)
  implicit none
  integer(kind=4), value :: requested
  integer(kind=4) :: i
  real(kind=8) :: total, values(1000)
  total = 0.0_8
!$omp parallel num_threads(requested) shared(values) private(i) reduction(+:total)
!$omp do schedule(static)
  do i = 1, 1000
    values(i) = real(i, kind=8) * 0.5_8
  end do
!$omp end do
  ! The implicit barrier must publish all values before the second loop.
!$omp do schedule(static)
  do i = 1, 1000
    total = total + values(1001-i)
  end do
!$omp end do
!$omp end parallel
  webroms_omp_sum = total
end function
