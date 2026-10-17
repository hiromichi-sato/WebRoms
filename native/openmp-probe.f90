integer(kind=4) function webroms_omp_probe() bind(C)
  implicit none
  integer(kind=4) :: count
  count = 0
!$omp parallel num_threads(2) reduction(+:count)
  count = count + 1
!$omp end parallel
  webroms_omp_probe = count
end function
