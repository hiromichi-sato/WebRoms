! WebROMS surface tracer flux, based on ROMS ana_stflux.h.
! Copyright (c) 2002-2026 The ROMS Group, MIT/X, see License_ROMS.md.
! USER(1:4): mode (0 off, 1 air relaxation, 2 direct), Tair, lambda, Q.
      SUBROUTINE ana_stflux (ng, tile, model, itrc)
      USE mod_param
      USE mod_forces
      USE mod_ncparam
      integer, intent(in) :: ng, tile, model, itrc
      character (len=*), parameter :: MyFile = __FILE__
#include "tile.h"
      CALL ana_stflux_tile (ng, tile, model, itrc,                     &
     &                      LBi, UBi, LBj, UBj,                        &
     &                      IminS, ImaxS, JminS, JmaxS,                &
     &                      FORCES(ng)%stflux)
      IF (Lanafile.and.(tile.eq.0)) ANANAME(31)=MyFile
      END SUBROUTINE ana_stflux

      SUBROUTINE ana_stflux_tile (ng, tile, model, itrc,               &
     &                            LBi, UBi, LBj, UBj,                  &
     &                            IminS, ImaxS, JminS, JmaxS,          &
     &                            stflux)
      USE mod_param
      USE mod_scalars
      USE mod_ocean, ONLY : OCEAN
      USE mod_stepping, ONLY : nstp
      USE exchange_2d_mod, ONLY : exchange_r2d_tile
#ifdef DISTRIBUTE
      USE mp_exchange_mod, ONLY : mp_exchange2d
#endif
      integer, intent(in) :: ng, tile, model, itrc
      integer, intent(in) :: LBi, UBi, LBj, UBj
      integer, intent(in) :: IminS, ImaxS, JminS, JmaxS
#ifdef ASSUMED_SHAPE
      real(r8), intent(inout) :: stflux(LBi:,LBj:,:)
#else
      real(r8), intent(inout) :: stflux(LBi:UBi,LBj:UBj,NT(ng))
#endif
      integer :: i, j, heat_mode
      real(r8) :: qheat
#include "set_bounds.h"
      heat_mode=0
      IF (allocated(user)) THEN
        IF (size(user).ge.4) heat_mode=NINT(user(1))
      END IF
      DO j=JstrT,JendT
        DO i=IstrT,IendT
          qheat=0.0_r8
          IF (itrc.eq.itemp) THEN
            IF (heat_mode.eq.1) THEN
! Idealized Newton heat exchange, not a meteorological bulk formula.
              qheat=user(3)*(user(2)-                                 &
     &              OCEAN(ng)%t(i,j,N(ng),nstp(ng),itemp))
            ELSE IF (heat_mode.eq.2) THEN
              qheat=user(4)
            END IF
! Positive Q heats the ocean; ROMS uses kinematic degC m/s.
            stflux(i,j,itrc)=qheat/(rho0*Cp)
          ELSE
            stflux(i,j,itrc)=0.0_r8
          END IF
        END DO
      END DO
      IF (EWperiodic(ng).or.NSperiodic(ng)) THEN
        CALL exchange_r2d_tile (ng, tile,                             &
     &                          LBi, UBi, LBj, UBj,                    &
     &                          stflux(:,:,itrc))
      END IF
#ifdef DISTRIBUTE
      CALL mp_exchange2d (ng, tile, model, 1,                          &
     &                    LBi, UBi, LBj, UBj, NghostPoints,           &
     &                    EWperiodic(ng), NSperiodic(ng),             &
     &                    stflux(:,:,itrc))
#endif
      END SUBROUTINE ana_stflux_tile
