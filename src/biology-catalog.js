// Generated from ROMS/External input examples by scripts/generate-biology-catalog.mjs.
export const BIO_MODELS = {
  "npzd": {
    "label": "NPZD (Franks)",
    "source": "roms/ROMS/External/npzd_Franks.in",
    "initialSource": "roms/ROMS/External/npzd_Franks.in",
    "parameters": [
      {
        "key": "BioIter",
        "value": 1,
        "unit": "",
        "description": "Nutrient-Phytoplankton-Zooplankton-Detritus Biological Model Parameters. git $Id$ ========================================================= Hernan G. Arango === Copyright (c) 2002-2026 The ROMS Group ! Licensed under a MIT/X style license ! See License_ROMS.md ! ============================================================================== ! Input parameters can be entered in ANY order, provided that the parameter ! KEYWORD (usually, upper case) is typed correctly followed by \"=\" or \"==\" ! symbols. Any comment lines are allowed and must begin with an exclamation ! mark (!) in column one. Comments may appear to the right of a parameter ! specification to improve documentation. Comments will be ignored during ! reading. Blank lines are also allowed and ignored. Continuation lines in ! a parameter specification are allowed and must be preceded by a backslash ! (\\). In some instances, more than one value is required for a parameter. ! If fewer values are provided, the last value is assigned for the entire ! parameter array. The multiplication symbol (*), without blank spaces in ! between, is allowed for a parameter specification. For example, in a two ! grids nested application: ! ! AKT_BAK == 2*1.0d-6 2*5.0d-6 ! m2/s ! ! indicates that the first two entries of array AKT_BAK, in fortran column- ! major order, will have the same value of \"1.0d-6\" for grid 1, whereas the ! next two entries will have the same value of \"5.0d-6\" for grid 2. ! ! In multiple levels of nesting and/or multiple connected domains step-ups, ! \"Ngrids\" entries are expected for some of these parameters. In such case, ! the order of the entries for a parameter is extremely important. It must ! follow the same order (1:Ngrids) as in the state variable declaration. The ! USER may follow the above guidelines for specifying his/her values. These ! parameters are marked by \"==\" plural symbol after the KEYWORD. ! ! ============================================================================== NOTICE: Input parameter units are specified within brackets and default ****** values are specified within braces. Switch to control the computation of biology within nested and/or multiple connected grids. Maximum number of iterations to achieve convergence of the nonlinear solution."
      },
      {
        "key": "K_ext",
        "value": 0.06,
        "unit": "1/m",
        "description": "Light extinction coefficient, [1/m], {0.067}."
      },
      {
        "key": "K_NO3",
        "value": 0.1,
        "unit": "1/(millimole_N m-3)",
        "description": "Inverse half-saturation for phytoplankton nitrate uptake [1/(millimole_N m-3)], {1.0d0}."
      },
      {
        "key": "K_Phy",
        "value": 0.4,
        "unit": "millimole_N m-3",
        "description": "Phytoplankton saturation coefficient, [millimole_N m-3], {0.4d0}."
      },
      {
        "key": "Vm_NO3",
        "value": 2,
        "unit": "1/day",
        "description": "Nitrate uptake rate, [1/day], {1.5d0}."
      },
      {
        "key": "PhyMR",
        "value": 0.05,
        "unit": "1/day",
        "description": "Phytoplankton senescence/mortality rate, [1/day], {0.1d0}."
      },
      {
        "key": "ZooGR",
        "value": 0.6,
        "unit": "1/day",
        "description": "Zooplankton maximum growth rate, [1/day], {0.52}."
      },
      {
        "key": "ZooMR",
        "value": 0.2,
        "unit": "1/day",
        "description": "Zooplankton mortality rate, [1/day], {0.145d0}."
      },
      {
        "key": "ZooMD",
        "value": 0.05,
        "unit": "1/day",
        "description": "Zooplankton death bits rate, [1/day], {0.05d0}."
      },
      {
        "key": "ZooGA",
        "value": 0.3,
        "unit": "nondimensional",
        "description": "Zooplankton grazing inefficiency, [nondimensional], {0.3d0}."
      },
      {
        "key": "ZooEC",
        "value": 0.15,
        "unit": "nondimensional",
        "description": "Zooplankton excreted fraction, [nondimensional], {0.15d0}."
      },
      {
        "key": "DetRR",
        "value": 0.1,
        "unit": "1/day",
        "description": "Detritus remineralization rate, [1/day], {0.1d0}."
      },
      {
        "key": "wDet",
        "value": 5,
        "unit": "m/day",
        "description": "Detrital sinking rate, [m/day], {8.0d0}."
      }
    ],
    "tracers": [
      {
        "key": "npzd_NO3_",
        "roms": "NO3_",
        "netcdf": "NO3",
        "boundary": "NO3",
        "label": "栄養塩 N",
        "initial": 1.67,
        "unit": "mmol N/m³"
      },
      {
        "key": "npzd_Phyt",
        "roms": "Phyt",
        "netcdf": "phytoplankton",
        "boundary": "phyt",
        "label": "植物プランクトン P",
        "initial": 0.08,
        "unit": "mmol N/m³"
      },
      {
        "key": "npzd_Zoop",
        "roms": "Zoop",
        "netcdf": "zooplankton",
        "boundary": "zoop",
        "label": "動物プランクトン Z",
        "initial": 0.06,
        "unit": "mmol N/m³"
      },
      {
        "key": "npzd_SDet",
        "roms": "SDet",
        "netcdf": "detritus",
        "boundary": "detritus",
        "label": "デトリタス D",
        "initial": 0.04,
        "unit": "mmol N/m³"
      }
    ]
  },
  "nemuro": {
    "label": "NEMURO",
    "source": "roms/ROMS/External/nemuro.in",
    "initialSource": "roms/sample/NEMURO.BOX.f90 (A7; mol/l to mmol/m3)",
    "parameters": [
      {
        "key": "BioIter",
        "value": 1,
        "unit": "",
        "description": "NEMURO Ecosystem Model Parameters. git $Id$ ========================================================= Hernan G. Arango === Copyright (c) 2002-2026 The ROMS Group ! Licensed under a MIT/X style license ! See License_ROMS.md ! ============================================================================== ! Input parameters can be entered in ANY order, provided that the parameter ! KEYWORD (usually, upper case) is typed correctly followed by \"=\" or \"==\" ! symbols. Any comment lines are allowed and must begin with an exclamation ! mark (!) in column one. Comments may appear to the right of a parameter ! specification to improve documentation. Comments will be ignored during ! reading. Blank lines are also allowed and ignored. Continuation lines in ! a parameter specification are allowed and must be preceded by a backslash ! (\\). In some instances, more than one value is required for a parameter. ! If fewer values are provided, the last value is assigned for the entire ! parameter array. The multiplication symbol (*), without blank spaces in ! between, is allowed for a parameter specification. For example, in a two ! grids nested application: ! ! AKT_BAK == 2*1.0d-6 2*5.0d-6 ! m2/s ! ! indicates that the first two entries of array AKT_BAK, in fortran column- ! major order, will have the same value of \"1.0d-6\" for grid 1, whereas the ! next two entries will have the same value of \"5.0d-6\" for grid 2. ! ! In multiple levels of nesting and/or multiple connected domains step-ups, ! \"Ngrids\" entries are expected for some of these parameters. In such case, ! the order of the entries for a parameter is extremely important. It must ! follow the same order (1:Ngrids) as in the state variable declaration. The ! USER may follow the above guidelines for specifying his/her values. These ! parameters are marked by \"==\" plural symbol after the KEYWORD. ! ! ============================================================================== NOTICE: Input parameter units are specified within brackets and default ****** values are specified within braces. Switch to control the computation of biology within nested and/or multiple connected grids. Maximum number of iterations to achieve convergence of the nonlinear solution."
      },
      {
        "key": "AttSW",
        "value": 0.04,
        "unit": "1/m",
        "description": "Light attenuation due to seawater [1/m]."
      },
      {
        "key": "AttPS",
        "value": 0.04,
        "unit": "m2/millimole_N",
        "description": "Light attenuation due to phytoplankton, self-shading coefficient, [m2/millimole_N]."
      },
      {
        "key": "AttPL",
        "value": 0.04,
        "unit": "",
        "description": ""
      },
      {
        "key": "PARfrac",
        "value": 0.43,
        "unit": "nondimensional",
        "description": "Fraction of shortwave radiation that is photosynthetically active, [nondimensional]."
      },
      {
        "key": "AlphaPS",
        "value": 0.01,
        "unit": "1/(W/m2) 1/day",
        "description": "Phytoplankton photochemical reaction coefficient, initial slope of the P-I curve [1/(W/m2) 1/day]."
      },
      {
        "key": "AlphaPL",
        "value": 0.01,
        "unit": "",
        "description": ""
      },
      {
        "key": "BetaPS",
        "value": 0.00045,
        "unit": "1/(W/m2) 1/day",
        "description": "Phytoplankton photoinhibition coefficient, [1/(W/m2) 1/day]."
      },
      {
        "key": "BetaPL",
        "value": 0.00045,
        "unit": "",
        "description": ""
      },
      {
        "key": "VmaxS",
        "value": 0.4,
        "unit": "1/day",
        "description": "Phytoplankton maximum photosynthetic rate at 0 Celsius [1/day]."
      },
      {
        "key": "VmaxL",
        "value": 0.8,
        "unit": "",
        "description": ""
      },
      {
        "key": "KNO3S",
        "value": 1,
        "unit": "millimole_N/m3",
        "description": "Phytoplankton half saturation constant for Nitrate [millimole_N/m3]."
      },
      {
        "key": "KNO3L",
        "value": 3,
        "unit": "",
        "description": ""
      },
      {
        "key": "KNH4S",
        "value": 0.1,
        "unit": "millimole_N/m3",
        "description": "Phytoplankton half saturation constant for Ammonium [millimole_N/m3]."
      },
      {
        "key": "KNH4L",
        "value": 0.3,
        "unit": "",
        "description": ""
      },
      {
        "key": "KSiL",
        "value": 6,
        "unit": "millimole_Si/m3",
        "description": "Phytoplankton half saturation constant for Silicate [millimole_Si/m3]."
      },
      {
        "key": "PusaiS",
        "value": 1.5,
        "unit": "m3/millimole_N",
        "description": "Phytoplankton Ammonium inhibition coefficient [m3/millimole_N]."
      },
      {
        "key": "PusaiL",
        "value": 1.5,
        "unit": "",
        "description": ""
      },
      {
        "key": "KGppS",
        "value": 0.0693,
        "unit": "1/Celsius",
        "description": "Phytoplankton temperature coefficient for photosynthetic rate [1/Celsius]."
      },
      {
        "key": "KGppL",
        "value": 0.0693,
        "unit": "",
        "description": ""
      },
      {
        "key": "ResPS0",
        "value": 0.03,
        "unit": "1/day",
        "description": "Phytoplankton respiration rate at 0 Celsius [1/day]."
      },
      {
        "key": "ResPL0",
        "value": 0.03,
        "unit": "",
        "description": ""
      },
      {
        "key": "KResPS",
        "value": 0.0519,
        "unit": "1/Celsius",
        "description": "Phytoplankton temperature coefficient for respiration [1/Celsius]."
      },
      {
        "key": "KResPL",
        "value": 0.0519,
        "unit": "",
        "description": ""
      },
      {
        "key": "GammaS",
        "value": 0.135,
        "unit": "nondimensional",
        "description": "Phytoplankton ratio of extracellular excretion to photosynthesis [nondimensional]."
      },
      {
        "key": "GammaL",
        "value": 0.135,
        "unit": "",
        "description": ""
      },
      {
        "key": "MorPS0",
        "value": 0.0585,
        "unit": "m3/millimole_N 1/day",
        "description": "Phytoplankton mortality rate at 0 Celsius [m3/millimole_N 1/day]."
      },
      {
        "key": "MorPL0",
        "value": 0.029,
        "unit": "",
        "description": ""
      },
      {
        "key": "KMorPS",
        "value": 0.0693,
        "unit": "1/Celsius",
        "description": "Phytoplankton temperature coefficient for mortality [1/Celsius]."
      },
      {
        "key": "KMorPL",
        "value": 0.0693,
        "unit": "",
        "description": ""
      },
      {
        "key": "GRmaxSps",
        "value": 0.4,
        "unit": "1/day",
        "description": "Zooplankton maximum grazing rate at 0 Celsius [1/day]."
      },
      {
        "key": "GRmaxLps",
        "value": 0.1,
        "unit": "",
        "description": ""
      },
      {
        "key": "GRmaxLpl",
        "value": 0.4,
        "unit": "",
        "description": ""
      },
      {
        "key": "GRmaxLzs",
        "value": 0.4,
        "unit": "",
        "description": ""
      },
      {
        "key": "GRmaxPpl",
        "value": 0.2,
        "unit": "",
        "description": ""
      },
      {
        "key": "GRmaxPzs",
        "value": 0.2,
        "unit": "",
        "description": ""
      },
      {
        "key": "GRmaxPzl",
        "value": 0.2,
        "unit": "",
        "description": ""
      },
      {
        "key": "KGraS",
        "value": 0.0693,
        "unit": "1/Celsius",
        "description": "Zooplankton temperature coefficient for grazing [1/Celsius]."
      },
      {
        "key": "KGraL",
        "value": 0.0693,
        "unit": "",
        "description": ""
      },
      {
        "key": "KGraP",
        "value": 0.0693,
        "unit": "",
        "description": ""
      },
      {
        "key": "LamS",
        "value": 1.4,
        "unit": "m3/millimole_N",
        "description": "Zooplankton Ivlev constant [m3/millimole_N]."
      },
      {
        "key": "LamL",
        "value": 1.4,
        "unit": "",
        "description": ""
      },
      {
        "key": "LamP",
        "value": 1.4,
        "unit": "",
        "description": ""
      },
      {
        "key": "KPS2ZS",
        "value": 0.16,
        "unit": "millimole_N/m3",
        "description": "Zooplankton half-saturation coefficient (squared) for ingestion used only when the Holling-type grazing formulation is activated [millimole_N/m3]^2."
      },
      {
        "key": "KPS2ZL",
        "value": 0.16,
        "unit": "",
        "description": ""
      },
      {
        "key": "KPL2ZL",
        "value": 0.16,
        "unit": "",
        "description": ""
      },
      {
        "key": "KZS2ZL",
        "value": 0.16,
        "unit": "",
        "description": ""
      },
      {
        "key": "KPL2ZP",
        "value": 0.16,
        "unit": "",
        "description": ""
      },
      {
        "key": "KZS2ZP",
        "value": 0.16,
        "unit": "",
        "description": ""
      },
      {
        "key": "KZL2ZP",
        "value": 0.16,
        "unit": "",
        "description": ""
      },
      {
        "key": "PS2ZSstar",
        "value": 0.043,
        "unit": "millimole_N/m3",
        "description": "Zooplankton threshold value for grazing [millimole_N/m3]."
      },
      {
        "key": "PS2ZLstar",
        "value": 0.04,
        "unit": "",
        "description": ""
      },
      {
        "key": "PL2ZLstar",
        "value": 0.04,
        "unit": "",
        "description": ""
      },
      {
        "key": "ZS2ZLstar",
        "value": 0.04,
        "unit": "",
        "description": ""
      },
      {
        "key": "PL2ZPstar",
        "value": 0.04,
        "unit": "",
        "description": ""
      },
      {
        "key": "ZS2ZPstar",
        "value": 0.04,
        "unit": "",
        "description": ""
      },
      {
        "key": "ZL2ZPstar",
        "value": 0.04,
        "unit": "",
        "description": ""
      },
      {
        "key": "PusaiPL",
        "value": 4.605,
        "unit": "m3/millimole_N",
        "description": "Zooplankton grazing inhibition coefficient [m3/millimole_N]."
      },
      {
        "key": "PusaiZS",
        "value": 3.01,
        "unit": "",
        "description": ""
      },
      {
        "key": "MorZS0",
        "value": 0.0585,
        "unit": "m3/millimole_N 1/day",
        "description": "Zooplankton mortality rate at 0 Celsius [m3/millimole_N 1/day]."
      },
      {
        "key": "MorZL0",
        "value": 0.0585,
        "unit": "",
        "description": ""
      },
      {
        "key": "MorZP0",
        "value": 0.0585,
        "unit": "",
        "description": ""
      },
      {
        "key": "KMorZS",
        "value": 0.0693,
        "unit": "1/Celsius",
        "description": "Zooplankton temperature coefficient for mortality [1/Celsius]."
      },
      {
        "key": "KMorZL",
        "value": 0.0693,
        "unit": "",
        "description": ""
      },
      {
        "key": "KMorZP",
        "value": 0.0693,
        "unit": "",
        "description": ""
      },
      {
        "key": "AlphaZS",
        "value": 0.7,
        "unit": "nondimemsional",
        "description": "Zooplankton assimilation efficiency [nondimemsional]."
      },
      {
        "key": "AlphaZL",
        "value": 0.7,
        "unit": "",
        "description": ""
      },
      {
        "key": "AlphaZP",
        "value": 0.7,
        "unit": "",
        "description": ""
      },
      {
        "key": "BetaZS",
        "value": 0.3,
        "unit": "nondimensional",
        "description": "Zooplankton growth efficiency [nondimensional]."
      },
      {
        "key": "BetaZL",
        "value": 0.3,
        "unit": "",
        "description": ""
      },
      {
        "key": "BetaZP",
        "value": 0.3,
        "unit": "",
        "description": ""
      },
      {
        "key": "Nit0",
        "value": 0.03,
        "unit": "1/day",
        "description": "Decomposition rates at 0 Celsius [1/day]."
      },
      {
        "key": "VP2N0",
        "value": 0.1,
        "unit": "",
        "description": ""
      },
      {
        "key": "VP2D0",
        "value": 0.1,
        "unit": "",
        "description": ""
      },
      {
        "key": "VD2N0",
        "value": 0.2,
        "unit": "",
        "description": ""
      },
      {
        "key": "VO2S0",
        "value": 0.1,
        "unit": "",
        "description": ""
      },
      {
        "key": "KNit",
        "value": 0.0693,
        "unit": "1/Celsius",
        "description": "Temperature coefficients for decomposition [1/Celsius]"
      },
      {
        "key": "KP2D",
        "value": 0.0693,
        "unit": "",
        "description": ""
      },
      {
        "key": "KP2N",
        "value": 0.0693,
        "unit": "",
        "description": ""
      },
      {
        "key": "KD2N",
        "value": 0.0693,
        "unit": "",
        "description": ""
      },
      {
        "key": "KO2S",
        "value": 0.0693,
        "unit": "",
        "description": ""
      },
      {
        "key": "RSiN",
        "value": 2,
        "unit": "millimole_Si/millimole_N",
        "description": "Si:N ratio [millimole_Si/millimole_N]."
      },
      {
        "key": "setVPON",
        "value": 40,
        "unit": "m/day",
        "description": "Settling (sinking) velocities [m/day]."
      },
      {
        "key": "setVOpal",
        "value": 40,
        "unit": "",
        "description": ""
      }
    ],
    "tracers": [
      {
        "key": "nemuro_Sphy",
        "roms": "Sphy",
        "netcdf": "nanophytoplankton",
        "boundary": "nanophy",
        "label": "小型植物プランクトン PS",
        "initial": 0.09999999999999999,
        "unit": "mmol N/m³"
      },
      {
        "key": "nemuro_Lphy",
        "roms": "Lphy",
        "netcdf": "diatom",
        "boundary": "diatom",
        "label": "大型植物プランクトン PL",
        "initial": 0.09999999999999999,
        "unit": "mmol N/m³"
      },
      {
        "key": "nemuro_Szoo",
        "roms": "Szoo",
        "netcdf": "microzooplankton",
        "boundary": "microzoo",
        "label": "小型動物プランクトン ZS",
        "initial": 0.09999999999999999,
        "unit": "mmol N/m³"
      },
      {
        "key": "nemuro_Lzoo",
        "roms": "Lzoo",
        "netcdf": "mesozooplankton",
        "boundary": "mesozoo",
        "label": "大型動物プランクトン ZL",
        "initial": 0.09999999999999999,
        "unit": "mmol N/m³"
      },
      {
        "key": "nemuro_Pzoo",
        "roms": "Pzoo",
        "netcdf": "Pzooplankton",
        "boundary": "Pzoo",
        "label": "捕食性動物プランクトン ZP",
        "initial": 0.09999999999999999,
        "unit": "mmol N/m³"
      },
      {
        "key": "nemuro_NO3_",
        "roms": "NO3_",
        "netcdf": "NO3",
        "boundary": "NO3",
        "label": "硝酸塩 NO3",
        "initial": 5,
        "unit": "mmol N/m³"
      },
      {
        "key": "nemuro_NH4_",
        "roms": "NH4_",
        "netcdf": "NH4",
        "boundary": "NH4",
        "label": "アンモニウム NH4",
        "initial": 0.09999999999999999,
        "unit": "mmol N/m³"
      },
      {
        "key": "nemuro_PON_",
        "roms": "PON_",
        "netcdf": "PON",
        "boundary": "PON",
        "label": "粒状有機窒素 PON",
        "initial": 0.09999999999999999,
        "unit": "mmol N/m³"
      },
      {
        "key": "nemuro_DON_",
        "roms": "DON_",
        "netcdf": "DON",
        "boundary": "DON",
        "label": "溶存有機窒素 DON",
        "initial": 0.09999999999999999,
        "unit": "mmol N/m³"
      },
      {
        "key": "nemuro_SiOH",
        "roms": "SiOH",
        "netcdf": "SiOH4",
        "boundary": "SiOH4",
        "label": "ケイ酸 SiOH4",
        "initial": 10,
        "unit": "mmol Si/m³"
      },
      {
        "key": "nemuro_opal",
        "roms": "opal",
        "netcdf": "opal",
        "boundary": "opal",
        "label": "オパール Opal",
        "initial": 0.01,
        "unit": "mmol Si/m³"
      }
    ]
  }
};
