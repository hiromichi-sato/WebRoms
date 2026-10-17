integer(kind=4) function webroms_roms_threads() bind(C)
  use mod_parallel, only: numthreads
  implicit none
  webroms_roms_threads = numthreads
end function
