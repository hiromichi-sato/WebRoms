import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
from openmp_tls_compat import symbols, remove_directives, patch_ir

class NativeTlsTests(unittest.TestCase):
    def test_module_variables_are_identified_and_only_active_directives_removed(self):
        source = 'module mod_parallel\n!$OMP THREADPRIVATE (InpThread, MyThread)\n!!$OMP THREADPRIVATE (shared)\nend module\n'
        names = symbols(source)
        self.assertEqual(names, {'_QMmod_parallelEinpthread', '_QMmod_parallelEmythread'})
        self.assertIn('!!$OMP', remove_directives(source))
        ir = '@_QMmod_parallelEinpthread = global i32 1\n@_QMmod_parallelEmythread = external global i32\n@shared = global i32 1\nattributes #0 = { noinline optnone }\n'
        result = patch_ir(ir, names)
        self.assertIn('= thread_local(localexec) global i32 1', result)
        self.assertIn('= external thread_local(localexec) global i32', result)
        self.assertIn('@shared = global i32 1', result)
        self.assertNotIn('optnone', result)

    def test_unsupported_semantics_fail_instead_of_becoming_shared(self):
        for source in ['!$omp parallel copyin(x)', '!$omp single copyprivate(x)', '!$omp threadprivate (x, &\n!$omp& y)']:
            with self.assertRaises(RuntimeError):
                remove_directives(source)
        with self.assertRaises(RuntimeError):
            symbols('!$omp threadprivate(x)')

if __name__ == '__main__':
    unittest.main()
