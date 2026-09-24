integer function webroms_size_kind() bind(C)
  use, intrinsic :: iso_c_binding
  webroms_size_kind = c_size_t
end function
