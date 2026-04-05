export type AlertType =
  | 'new_listing'
  | 'price_change'
  | 'title_change'
  | 'review_spike'
  | 'listing_disappeared'
  | 'bestseller_change'
  | 'new_shop_listing'
  | 'trending_new_hot'
  | 'trending_velocity_spike'
  | 'trending_status_change';

export type AlertSeverity = 'info' | 'warning' | 'important';

export interface Alert {
  id: number;
  alert_type: AlertType;
  shop_id: number | null;
  listing_id: number | null;
  keyword_id: number | null;
  old_value: string | null;
  new_value: string | null;
  severity: AlertSeverity;
  is_read: number;
  created_at: string;
}

export interface AlertFilters {
  type?: AlertType;
  severity?: AlertSeverity;
  shopId?: number;
  isRead?: boolean;
  limit?: number;
  offset?: number;
}
