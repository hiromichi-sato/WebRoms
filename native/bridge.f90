module webroms_bridge
  use iso_c_binding
  use mod_kinds, only: dp
  use mod_param, only: Lm, Mm, N
  use mod_iounits, only: stdinp
  use mod_scalars, only: exit_flag, time, dt, itemp, isalt
  use mod_stepping, only: nnew, knew
  use mod_ocean, only: OCEAN
#ifdef BIO_FENNEL
  use mod_biology, only: iNO3_, iNH4_, iChlo, iPhyt, iZoop, iLDeN, iSDeN
#elif defined NPZD_FRANKS || defined NEMURO
  use mod_biology, only: idbio
#endif
  use mod_grid, only: GRID
  use roms_kernel_mod, only: ROMS_initialize, ROMS_run, ROMS_finalize
  implicit none
  logical, save :: first = .true., initialized = .false.
  integer, save :: slot3 = 1
contains
  integer(c_int) function webroms_model() bind(C)
#if defined NPZD_FRANKS
    webroms_model = 1
#elif defined NEMURO
    webroms_model = 2
#elif defined BIO_FENNEL
    webroms_model = 3
#else
    webroms_model = 0
#endif
  end function
  integer(c_int) function webroms_init() bind(C)
    integer :: status
    if (initialized) then
      webroms_init = -1
      return
    end if
    open(newunit=stdinp, file='roms.in', status='old', action='read', iostat=status)
    if (status /= 0) then
      webroms_init = -2
      return
    end if
    call ROMS_initialize(first)
    webroms_init = exit_flag
    initialized = exit_flag == 0
  end function

  integer(c_int) function webroms_step() bind(C)
    if (.not. initialized) then
      webroms_step = -3
      return
    end if
    call ROMS_run(0.0_dp)
    slot3 = nnew(1)
    webroms_step = exit_flag
  end function

  real(c_double) function webroms_time() bind(C)
    webroms_time = time(1)
  end function

  integer(c_int) function webroms_copy(field, output) bind(C)
    integer(c_int), value :: field
    real(c_double), intent(out) :: output(*)
    integer :: i, j, k, p, imax, jmax, kmax, imin, jmin
    if (.not. initialized) then
      webroms_copy = -3
      return
    end if
    imin=0; jmin=0; imax=Lm(1)+1; jmax=Mm(1)+1; kmax=1; p=0
    if (field==2 .or. field==3 .or. field==4 .or. field==5 .or. field==8) kmax=N(1)
#ifdef BIO_FENNEL
    if (field>=9 .and. field<=15) kmax=N(1)
#elif defined NPZD_FRANKS || defined NEMURO
    if (field>=9 .and. field<=8+size(idbio)) kmax=N(1)
#endif
    if (field==4 .or. field==6) imin=1
    if (field==5 .or. field==7) jmin=1
    do k=1,kmax
      do j=jmin,jmax
        do i=imin,imax
          p=p+1
          select case(field)
          case(0)
            output(p)=GRID(1)%h(i,j)
          case(1)
            output(p)=OCEAN(1)%zeta(i,j,knew(1))
          case(2)
            output(p)=OCEAN(1)%t(i,j,k,slot3,itemp)
          case(3)
            output(p)=OCEAN(1)%t(i,j,k,slot3,isalt)
          case(4)
            output(p)=OCEAN(1)%u(i,j,k,slot3)
          case(5)
            output(p)=OCEAN(1)%v(i,j,k,slot3)
          case(6)
            output(p)=OCEAN(1)%ubar(i,j,knew(1))
          case(7)
            output(p)=OCEAN(1)%vbar(i,j,knew(1))
          case(8)
            output(p)=GRID(1)%z_r(i,j,k)
#ifdef BIO_FENNEL
          case(9)
            output(p)=OCEAN(1)%t(i,j,k,slot3,iNO3_)
          case(10)
            output(p)=OCEAN(1)%t(i,j,k,slot3,iNH4_)
          case(11)
            output(p)=OCEAN(1)%t(i,j,k,slot3,iPhyt)
          case(12)
            output(p)=OCEAN(1)%t(i,j,k,slot3,iZoop)
          case(13)
            output(p)=OCEAN(1)%t(i,j,k,slot3,iLDeN)
          case(14)
            output(p)=OCEAN(1)%t(i,j,k,slot3,iSDeN)
          case(15)
            output(p)=OCEAN(1)%t(i,j,k,slot3,iChlo)
#endif
          case default
#if defined NPZD_FRANKS || defined NEMURO
            if (field>=9 .and. field<=8+size(idbio)) then
              output(p)=OCEAN(1)%t(i,j,k,slot3,idbio(field-8))
            else
              webroms_copy=-4
              return
            end if
#else
            webroms_copy=-4
            return
#endif
          end select
        end do
      end do
    end do
    webroms_copy=p
  end function

  subroutine webroms_finalize() bind(C)
    if (initialized) call ROMS_finalize()
    initialized=.false.
  end subroutine
end module
