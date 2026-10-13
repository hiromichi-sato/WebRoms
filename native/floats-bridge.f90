module webroms_floats_bridge
  use iso_c_binding
  use mod_param, only: Nfloats, Lm, Mm, N
  use mod_scalars, only: Lfloats, time, dt
  use mod_floats, only: DRIFTER, ixgrd, iygrd, izgrd, itstr, idpth
  use mod_stepping, only: nf, nfp1, nfm1, nfm2, nfm3
  use mod_grid, only: GRID
  implicit none
contains
  integer(c_int) function webroms_floats_version() bind(C)
    webroms_floats_version = 1
  end function

  subroutine webroms_floats_pause() bind(C)
    Lfloats(1) = .false.
  end subroutine

  integer(c_int) function webroms_floats_seed(count, kind, xyz) bind(C)
    integer(c_int), value :: count, kind
    real(c_double), intent(in) :: xyz(*)
    integer :: l, i, j, k, a, b, ii, jj
    real(c_double) :: x, y, depth, zgrid, bottom, top, weight, weights, level(0:N(1))
    webroms_floats_seed = -1
    if (.not.allocated(DRIFTER)) return
    if (count < 1 .or. count > size(DRIFTER(1)%bounded)) return
    if (kind /= 1 .and. kind /= 3) return
    ! Validate the complete release before replacing an existing experiment.
    do l=1,count
      x = xyz(3*l-2); y = xyz(3*l-1); depth = xyz(3*l)
      if (.not.(x >= 0.5d0 .and. x < Lm(1)+0.5d0)) return
      if (.not.(y >= 0.5d0 .and. y < Mm(1)+0.5d0)) return
      i = nint(x); j = nint(y)
      if (GRID(1)%rmask(i,j) < 0.5d0) return
      if (.not.(depth > 0d0 .and. depth < GRID(1)%h(i,j))) return
      if (-depth >= GRID(1)%z_w(i,j,N(1))) return
    end do
    Lfloats(1) = .false.
    Nfloats(1) = count
    DRIFTER(1)%bounded = .false.
    DRIFTER(1)%track = 0d0
    DRIFTER(1)%Tinfo = 0d0
    DRIFTER(1)%Findex = 0
    nf(1)=0; nfp1(1)=1; nfm1(1)=4; nfm2(1)=3; nfm3(1)=2
    do l=1,count
      x = xyz(3*l-2); y = xyz(3*l-1); depth = xyz(3*l)
      i = nint(x); j = nint(y)
      i = min(Lm(1), max(0, int(x))); j = min(Mm(1), max(0, int(y)))
      level = 0d0; weights = 0d0
      do a=0,1
        do b=0,1
          ii = i+a; jj = j+b
          weight = (1d0-abs(x-ii))*(1d0-abs(y-jj))*GRID(1)%rmask(ii,jj)
          weights = weights+weight
          level = level+weight*GRID(1)%z_w(ii,jj,0:N(1))
        end do
      end do
      level = level/max(weights, tiny(1d0))
      zgrid = 0.5d0
      do k=0,N(1)-1
        bottom = level(k); top = level(k+1)
        if (-depth >= bottom .and. -depth <= top) then
          zgrid = k + (-depth-bottom)/(top-bottom)
          exit
        end if
      end do
      DRIFTER(1)%Ftype(l) = kind
      DRIFTER(1)%Fz0(l) = -depth
      DRIFTER(1)%Tinfo(itstr,l) = time(1)
      DRIFTER(1)%Tinfo(ixgrd,l) = x
      DRIFTER(1)%Tinfo(iygrd,l) = y
      DRIFTER(1)%Tinfo(izgrd,l) = zgrid
    end do
    Lfloats(1) = .true.
    webroms_floats_seed = 0
  end function

  integer(c_int) function webroms_floats_copy(output) bind(C)
    real(c_double), intent(out) :: output(*)
    integer :: l
    webroms_floats_copy = Nfloats(1)
    do l=1,Nfloats(1)
      output(4*l-3) = DRIFTER(1)%track(ixgrd,nf(1),l)
      output(4*l-2) = DRIFTER(1)%track(iygrd,nf(1),l)
      output(4*l-1) = -DRIFTER(1)%track(idpth,nf(1),l)
      output(4*l) = 0d0
      if (time(1) >= DRIFTER(1)%Tinfo(itstr,l)) output(4*l) = 2d0
      if (DRIFTER(1)%bounded(l)) output(4*l) = 1d0
    end do
  end function
end module
