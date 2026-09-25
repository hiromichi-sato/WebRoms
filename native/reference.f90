program reference
  use webroms_bridge
  implicit none
  integer :: step, status, field, count, out, steps, nx, ny, nz, last_field
  character(32) :: arg
  real(c_double), allocatable :: values(:)
  call get_command_argument(1, arg); read(arg,*) steps
  call get_command_argument(2, arg); read(arg,*) nx
  call get_command_argument(3, arg); read(arg,*) ny
  call get_command_argument(4, arg); read(arg,*) nz
  status=webroms_init()
  if (status /= 0) stop 1
  do step=1,steps
    status=webroms_step()
    if (status /= 0) stop 2
  end do
  allocate(values(nx*ny*nz))
  open(newunit=out,file='reference.bin',access='stream',form='unformatted',status='replace')
  write(out) webroms_time()
  last_field=8
  if (webroms_model() == 1) last_field=12
  if (webroms_model() == 2) last_field=19
  do field=0,last_field
    count=webroms_copy(field,values)
    if (count < 0) stop 3
    write(out) values(1:count)
  end do
  close(out)
  call webroms_finalize()
end program
