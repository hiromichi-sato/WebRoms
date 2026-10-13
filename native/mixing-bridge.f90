! Separate ABI for inspecting computed coefficients without changing state IDs.
integer(c_int) function webroms_copy_mixing(field, output) bind(C)
  use iso_c_binding
  use mod_param, only: Lm, Mm, N
  use mod_mixing, only: MIXING
  use mod_scalars, only: itemp, isalt
  implicit none
  integer(c_int), value :: field
  real(c_double), intent(out) :: output(*)
  integer :: i, j, k, p
  if (field < 0 .or. field > 2) then
    webroms_copy_mixing = -4
    return
  end if
  p = 0
  do k=0,N(1)
    do j=0,Mm(1)+1
      do i=0,Lm(1)+1
        p=p+1
        select case(field)
        case(0)
          output(p)=MIXING(1)%Akt(i,j,k,itemp)
        case(1)
          output(p)=MIXING(1)%Akt(i,j,k,isalt)
        case(2)
          output(p)=MIXING(1)%Akv(i,j,k)
        end select
      end do
    end do
  end do
  webroms_copy_mixing=p
end function
