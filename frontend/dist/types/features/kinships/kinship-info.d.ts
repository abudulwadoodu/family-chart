import { KinshipInfoConfig } from './calculate-kinships';
import { Datum, Data } from '../../types/data';
export declare function kinshipInfo(kinship_info_config: KinshipInfoConfig, rel_id: Datum['id'], data_stash: Data): HTMLElement | undefined;
