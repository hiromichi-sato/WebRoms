module webroms_bridge
  use iso_c_binding
  use mod_kinds, only: dp
  use mod_param, only: Lm, Mm, N
  use mod_iounits, only: stdinp
  use mod_iounits, only: RST, INI
  use mod_param, only: iNLM
  use mod_scalars, only: nrrec, iic, ntstart
  use mod_netcdf, only: netcdf_close, netcdf_get_ivar
  use def_rst_mod, only: def_rst
  use wrt_rst_mod, only: wrt_rst
  use mod_coupling, only: COUPLING
  use set_depth_mod, only: set_depth
  use mod_scalars, only: exit_flag, time, dt, itemp, isalt
  use mod_stepping, only: nnew, knew, nstp, nrhs, kstp, krhs
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
  integer(c_int) function webroms_checkpoint() bind(C)
    integer :: saved_nrrec, unit, status
    if (.not. initialized) then
      webroms_checkpoint = -3
      return
    end if
    ! Force creation of a single transient restart without advancing the model.
    saved_nrrec = nrrec(1)
    nrrec(1) = -1
    call def_rst(1)
    nrrec(1) = saved_nrrec
    if (exit_flag == 0) then
      ! Standard output runs before main3d increments iic; mirror that phase.
      iic(1) = iic(1) - 1
      call wrt_rst(1, 0)
      iic(1) = iic(1) + 1
    end if
    call netcdf_close(1, iNLM, RST(1)%ncid)
    RST(1)%ncid = -1
    webroms_checkpoint = exit_flag
    if (exit_flag /= 0) return
    ! Split-explicit coupling averages are not in the standard restart file.
    open(newunit=unit, file='experiment_coupling.bin', access='stream', &
         form='unformatted', status='replace', action='write', iostat=status)
    if (status /= 0) then
      webroms_checkpoint = -4
      return
    end if
    write(unit, iostat=status) 1, Lm(1), Mm(1), N(1), &
      COUPLING(1)%Zt_avg1, COUPLING(1)%DU_avg1, COUPLING(1)%DV_avg1, &
      COUPLING(1)%DU_avg2, COUPLING(1)%DV_avg2, COUPLING(1)%rufrc, COUPLING(1)%rvfrc
    close(unit)
    if (status /= 0) webroms_checkpoint = -4
  end function
  integer(c_int) function webroms_heat_version() bind(C)
    webroms_heat_version = 1
  end function
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
    integer :: status, unit, header(4)
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
    if (exit_flag == 0 .and. nrrec(1) /= 0) then
      ! INI_FILE reads with model=iNLM, whereas upstream index restoration
      ! is guarded by model=0. Restore the perfect-restart indices explicitly.
      call netcdf_get_ivar(1, iNLM, INI(1)%name, 'nstp', nstp(1:), start=(/1/), total=(/1/))
      call netcdf_get_ivar(1, iNLM, INI(1)%name, 'nrhs', nrhs(1:), start=(/1/), total=(/1/))
      call netcdf_get_ivar(1, iNLM, INI(1)%name, 'nnew', nnew(1:), start=(/1/), total=(/1/))
      call netcdf_get_ivar(1, iNLM, INI(1)%name, 'kstp', kstp(1:), start=(/1/), total=(/1/))
      call netcdf_get_ivar(1, iNLM, INI(1)%name, 'krhs', krhs(1:), start=(/1/), total=(/1/))
      call netcdf_get_ivar(1, iNLM, INI(1)%name, 'knew', knew(1:), start=(/1/), total=(/1/))
      ! All WebROMS primary runs start at model second zero.
      ntstart(1) = 1
      slot3 = nstp(1)
      open(newunit=unit, file='experiment_coupling.bin', access='stream', &
           form='unformatted', status='old', action='read', iostat=status)
      if (status /= 0) then
        webroms_init = -4
        return
      end if
      read(unit, iostat=status) header
      if (status /= 0 .or. any(header /= (/1, Lm(1), Mm(1), N(1)/))) then
        close(unit)
        webroms_init = -4
        return
      end if
      read(unit, iostat=status) &
        COUPLING(1)%Zt_avg1, COUPLING(1)%DU_avg1, COUPLING(1)%DV_avg1, &
        COUPLING(1)%DU_avg2, COUPLING(1)%DV_avg2, COUPLING(1)%rufrc, COUPLING(1)%rvfrc
      close(unit)
      if (status /= 0) then
        webroms_init = -4
        return
      end if
      call set_depth(1, 0, iNLM)
    else
      slot3 = nnew(1)
    end if
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
